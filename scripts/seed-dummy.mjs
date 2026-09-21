import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { buildSync } from 'esbuild';
import { migrateLocal } from './local-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH = '.wrangler/logs';

buildSync({ entryPoints: ['lib/security.ts', 'lib/domain.ts'], bundle: true, platform: 'node', format: 'esm', outdir: '.test-build', logLevel: 'silent' });
const sec = await import('../.test-build/security.js');
const dom = await import('../.test-build/domain.js');
const { encrypt, keyedHash, sha256, randomToken } = sec;
const { cleanQuestions, computeScore, normalize } = dom;

const varsText = await readFile('.dev.vars', 'utf8').catch(() => '');
const DATA_KEY = varsText.match(/^DATA_KEY=([a-f0-9]{64})\s*$/m)?.[1];
if (!DATA_KEY) throw new Error('DATA_KEY tidak ditemukan di .dev.vars.');

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(20260914);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const DAY = 86400000;
const DEMO_USERNAMES = ['dewi-hrp', 'rina-hrp', 'bayu-hrp', 'angga-hrp'];

const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const pngChunk = (type, data) => { const len = Buffer.alloc(4), typeBuf = Buffer.from(type, 'ascii'), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data]))); return Buffer.concat([len, typeBuf, data, crc]); };
function bannerPng(w, h, top, bottom) {
  const hex = (s) => [s.slice(1, 3), s.slice(3, 5), s.slice(5, 7)].map((x) => parseInt(x, 16));
  const t = hex(top), b = hex(bottom);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    const f = y / (h - 1);
    const r = Math.round(t[0] + (b[0] - t[0]) * f), g = Math.round(t[1] + (b[1] - t[1]) * f), bl = Math.round(t[2] + (b[2] - t[2]) * f);
    for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = bl; }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}
const BANNER_PALETTES = [['#0e7490', '#22d3ee'], ['#4338ca', '#818cf8'], ['#b45309', '#fbbf24'], ['#be185d', '#f472b6'], ['#047857', '#34d399'], ['#6d28d9', '#a78bfa']];

console.log('Membuka database lokal D1…');
const proxy = await getPlatformProxy({ configPath: path.join(root, 'wrangler.local.json'), remoteBindings: false });
const db = proxy.env.DB;
const bucket = proxy.env.BUCKET;
try {
  await migrateLocal(db, root);

  const workspace = await db.prepare('SELECT id,name,privacy_notice,privacy_contact,retention_days FROM workspace WHERE id=?').bind('hrp-insight').first();
  const existingMembers = (await db.prepare('SELECT id,username,name,role,active FROM members').all()).results;
  if (!workspace || !existingMembers.length) throw new Error('Workspace/akun belum ada. Jalankan npm run setup:local dulu.');
  const admin = existingMembers.find((m) => m.role === 'admin');
  const byUsername = Object.fromEntries(existingMembers.map((m) => [m.username, m]));
  if (!admin) throw new Error('Akun admin tidak ditemukan.');
  const kept = existingMembers.filter((m) => !DEMO_USERNAMES.includes(m.username));
  console.log('  Mengosongkan data lama dan menghapus akun demo…');
  for (const t of ['responses', 'media', 'training_members', 'help', 'templates', 'audit', 'forms', 'trainings', 'sessions', 'rate_limits']) await db.prepare('DELETE FROM ' + t).run();
  if (bucket) { const listed = await bucket.list({ prefix: 'banners/' }); for (const o of listed.objects) await bucket.delete(o.key); }
  for (const m of existingMembers) {
    if (DEMO_USERNAMES.includes(m.username)) {
      await db.prepare('DELETE FROM members WHERE id=?').bind(m.id).run();
      delete byUsername[m.username];
    }
  }
  if (kept.length) console.log('  Mempertahankan akun: ' + kept.map((m) => m.username).join(', ') + '. Tidak ada akun demo yang dibuat.');
  await db.prepare("UPDATE workspace SET privacy_contact=? WHERE id=?").bind('hrp@astra.co.id', 'hrp-insight').run();

  const privacySnapshot = JSON.stringify({ name: workspace.name, privacy_notice: workspace.privacy_notice, privacy_contact: 'hrp@astra.co.id', retention_days: workspace.retention_days });

  const q = (id, type, label, extra = {}) => ({ id, type, label, help: '', required: true, options: [], scale: 5, allowOther: false, scored: false, multiCorrect: [], weight: 1, ...extra });

  const BANK = [
    ['Kegiatan asesmen yang dilakukan selama proses pembelajaran berlangsung disebut asesmen…', ['sumatif', 'formatif', 'diagnostik', 'sertifikasi'], 1],
    ['Instrumen yang paling tepat untuk mengukur keterampilan menulis peserta adalah…', ['pilihan ganda', 'tes uraian', 'benar-salah', 'tes lisan'], 1],
    ['Langkah awal dalam perencanaan pembelajaran berbasis data adalah…', ['menentukan media', 'mengidentifikasi capaian', 'menyusun jadwal', 'membuat soal'], 1],
    ['Media pembelajaran digital paling sesuai untuk demonstrasi proses bertahap adalah…', ['video tutorial', 'infografis statis', 'buku teks', 'poster'], 0],
    ['Prinsip penilaian autentik menekankan pada…', ['hafalan konsep', 'konteks nyata', 'kecepatan mengerjakan', 'keseragaman jawaban'], 1],
    ['Umpan balik yang efektif sebaiknya diberikan…', ['pada akhir semester', 'secara langsung dan spesifik', 'tanpa diketahui peserta', 'hanya secara tertulis'], 1],
    ['Fungsi asesmen diagnostik adalah untuk…', ['menentukan kelulusan', 'memetakan kebutuhan belajar', 'memberi nilai akhir', 'membandingkan sekolah'], 1],
    ['Yang dimaksud pembelajaran berdiferensiasi adalah…', ['materi sama untuk semua', 'menyesuaikan kebutuhan murid', 'mengelompokkan berdasarkan umur', 'mengurangi jam belajar'], 1],
    ['Indikator ketercapaian tujuan pembelajaran yang baik bersifat…', ['abstrak', 'terukur', 'panjang', 'umum'], 1],
    ['Salah satu ciri soal HOTS adalah…', ['menuntut ingatan', 'melibatkan analisis', 'jawaban tunggal singkat', 'menggunakan kata sudah umum'], 1],
    ['Data hasil belajar peserta perlu diolah untuk…', ['arsip administrasi', 'perbaikan pembelajaran', 'syarat kenaikan gaji', 'formalitas'], 1],
    ['Perencanaan pembelajaran yang efektif dimulai dari…', ['memilih aplikasi', 'analisis kebutuhan', 'menentukan anggaran', 'menyusun soal'], 1],
    ['Teknik menanya yang baik dalam kelas menggunakan pertanyaan…', ['tertutup', 'terbuka dan probing', 'retoris', 'berulang'], 1],
    ['Pemanfaatan AI dalam penyusunan modul sebaiknya…', ['menyalin otomatis', 'verifikasi dan kurasi', 'menggantikan guru', 'mengurangi materi'], 1],
    ['Rubrik penilaian digunakan untuk…', ['membuat kelas ramai', 'menilai secara transparan', 'mengurangi beban mengajar', 'mengganti ujian'], 1],
    ['Untuk melatih keterampilan berpikir kritis, soal sebaiknya…', ['tertutup', 'berbasis kasus', 'kata demi kata dari buku', 'hanya teori'], 1],
    ['Evaluasi program pelatihan menggunakan model Kirkpatrick dimulai dari level…', ['hasil', 'perilaku', 'reaksi', 'pembelajaran'], 2],
    ['Salah satu keunggulan asesmen berbasis komputer adalah…', ['otomatisasi skor', 'mengurangi variasi', 'menghapus nilai', 'memperlambat proses'], 0],
    ['Pengaturan waktu penyampaian materi di kelas dipengaruhi oleh…', ['kesesuaian alokasi', 'kesukaan guru', 'ketersediaan snack', 'jadwal rapat'], 0],
    ['Data observasi kelas yang paling objektif diperoleh dari…', ['ingatan guru', 'catatan lapangan', 'gossip', 'asumsi'], 1],
  ];

  function skillQuestions(seedOff = 0) {
    const r = mulberry(7000 + seedOff);
    const picked = [...BANK].sort(() => r() - 0.5).slice(0, 10);
    const qs = [q('kode', 'short_text', 'Kode peserta')];
    picked.forEach(([label, options, correct], i) => {
      const choice = [...options];
      qs.push(q('k' + (i + 1), 'single_choice', label, { options: choice, correctAnswer: choice[correct], scored: true, weight: 1 }));
    });
    return cleanQuestions(qs);
  }

  const LIKERT = (id, label) => q(id, 'likert', label, { scale: 5 });
  const OTHER = (id, label) => q(id, 'single_choice', label, { options: ['Opsional', 'Tidak tahu'], allowOther: true, required: false });

  function evaluasiQuestions(seedOff = 0, theme = 'kegiatan ini') {
    const r = mulberry(9000 + seedOff);
    const qs = [
      q('bagian-awal', 'section', 'Identitas & partisipasi'),
      q('peran', 'short_text', 'Peran Anda dalam ' + theme, { required: false }),
      LIKERT('materi', 'Materi disampaikan dengan jelas dan terstruktur'),
      LIKERT('fasilitator', 'Fasilitator menguasai materi dan komunikatif'),
      LIKERT('praktik', 'Praktik langsung membantu pemahaman materi'),
      LIKERT('waktu', 'Alokasi waktu pelaksanaan sudah memadai'),
      LIKERT('media', 'Media dan bahan ajar mendukung proses belajar'),
      { ...q('bagian-pilih', 'single_choice', 'Bagian materi yang paling bermanfaat?', { options: ['Praktik langsung', 'Materi teoretis', 'Diskusi kelompok', 'Studi kasus'], allowOther: true }) },
      q('manfaat', 'yes_no', 'Materi relevan dengan kebutuhan kerja Anda?', { options: [] }),
      q('komitmen', 'single_choice', 'Setelah mengikuti ' + theme + ', seberapa besar Anda akan menerapkannya?', { options: ['Segera terapkan', 'Perlu pendampingan', 'Belum dapat terapkan'] }),
      q('perbaikan', 'multiple_choice', 'Aspek yang perlu ditingkatkan dari ' + theme + ' (boleh lebih dari satu)', { options: ['Durasi', 'Lokasi/fasilitas', 'Materi contoh', 'Media pembelajaran'], allowOther: true }),
      OTHER('bagian-lain', 'Bagian lain yang menurut Anda perlu ditambahkan?'),
      q('durasi', 'number', 'Durasi ideal menurut Anda (menit)', { required: false }),
      q('kesan', 'long_text', 'Kesan dan saran Anda untuk perbaikan ke depan'),
    ];
    return cleanQuestions(qs);
  }

  function praPascaQuestions(phase) {
    const qs = [
      q('bagian-awal', 'section', 'Bagian ini menilai kondisi sebelum/sesudah'),
      LIKERT('pemahaman', phase === 'pra' ? 'Pemahaman saya terhadap fasilitasi daring awal' : 'Pemahaman saya terhadap fasilitasi daring kini'),
      LIKERT('percaya', phase === 'pra' ? 'Kepercayaan diri memfasilitasi daring sebelum' : 'Kepercayaan diri memfasilitasi daring setelah pelatihan'),
      LIKERT('teknik', phase === 'pra' ? 'Penguasaan teknik ice-breaking' : 'Penguasaan teknik ice-breaking setelah praktik'),
      LIKERT('kelola', phase === 'pra' ? 'Kemampuan mengelola kelas daring' : 'Kemampuan mengelola kelas daring setelah pelatihan'),
      { ...q('bagian-pilih', 'single_choice', 'Topik yang paling ingin/berhasil dikuasai', { options: ['Breakout room', 'Quiz interaktif', 'Manajemen waktu', 'Teknik bertanya'], allowOther: true }) },
      q('kesan', 'long_text', 'Hal yang paling membekas dari sesi ini'),
    ];
    return cleanQuestions(qs);
  }

  function tindakLanjutQuestions(theme) {
    const qs = [
      LIKERT('terapkan', 'Materi ' + theme + ' langsung saya terapkan di tempat kerja'),
      LIKERT('dukungan', 'Dukungan lingkungan kerja memadai untuk menerapkan ilmu'),
      { ...q('hambatan', 'multiple_choice', 'Hambatan yang dihadapi saat penerapan', { options: ['Waktu', 'Fasilitas', 'Dukungan pimpinan', 'Keterampilan diri'], allowOther: true }) },
      q('kesan', 'long_text', 'Kemajuan yang sudah dicapai dan dukungan yang dibutuhkan'),
    ];
    return cleanQuestions(qs);
  }

  function kebutuhanQuestions() {
    const qs = [
      q('peran', 'short_text', 'Peran/panggilan Anda saat ini'),
      LIKERT('urgensi', 'Seberapa urgen kebutuhan pelatihan ini bagi Anda'),
      { ...q('topik', 'multiple_choice', 'Topik yang paling ingin dipelajari', { options: ['Konsep dasar', 'Praktik langsung', 'Instrumen pengukuran', 'Studi kasus'], allowOther: true }) },
      { ...q('waktu', 'single_choice', 'Waktu yang paling cocok bagi Anda', { options: ['Weekday pagi', 'Weekday sore', 'Sabtu', 'Akhir pekan'], allowOther: true }) },
      q('kesan', 'long_text', 'Harapan Anda terhadap pelatihan ini'),
    ];
    return cleanQuestions(qs);
  }

  const POSITIVE = [
    'Materi sangat bermanfaat dan langsung bisa diterapkan di sekolah. Terima kasih tim HRP.',
    'Penyampaian fasilitator jelas, contoh-contohnya relevan dengan kondisi saya di lapangan.',
    'Praktik langsung membuat saya lebih percaya diri. Mohon ada sesi lanjutan.',
    'Moderasi dan pengelolaan waktu sudah baik. Durasi sedikit terasa berlebih.',
    'Media pembelajaran yang dibagikan sangat membantu dan mudah dipahami.',
    'Semoga kegiatan serupa diadakan rutin dan bisa diikuti peserta dari luar kota.',
    'Materi sesuai kebutuhan, semoga ada pendampingan tindak lanjut di lapangan.',
    'Kegiatan berjalan lancar, diskusi kelompok memberikan perspektif baru.',
    'Contoh kasus nyata sangat memperkaya pemahaman saya.',
    'Secara keseluruhan bagus. Sedikit catatan: ruangan perlu pendingin lebih baik.',
  ];
  const NEGATIVE = [
    'Durasi terlalu singkat untuk materi sebanyak ini.',
    'Sebagian materi terasa teoritis, mohon lebih banyak praktik.',
    'Koneksi internet peserta sempat terganggu saat sesi daring.',
    'Contoh yang diberikan kurang bervariasi untuk jenjang saya.',
    'Perlu persiapan perangkat lebih baik, ada sesi yang terpotong.',
  ];

  function belajar(pair) {
    return pair ? pick(POSITIVE) : pick(NEGATIVE);
  }

  function makeAnonAnswers(formSpec, theme) {
    const a = {};
    const peran = ['Guru SD', 'Guru SMP', 'Guru SMA', 'Kepala Sekolah', 'Tenaga Kependidikan', 'Pengawas', 'Guru PAUD'];
    for (const question of formSpec.questions) {
      if (question.type === 'section' || question.type === 'pagebreak') continue;
      if (question.id === 'peran') { const v = pick(peran); if (rand() > 0.18) a[question.id] = v; continue; }
      if (question.id === 'durasi') { a[question.id] = String(int(30, 240)); continue; }
      if (question.id === 'manfaat') { a[question.id] = rand() > 0.12 ? 'Ya' : 'Tidak'; continue; }
      if (question.id === 'komitmen') { a[question.id] = rand() > 0.55 ? 'Segera terapkan' : rand() > 0.5 ? 'Perlu pendampingan' : 'Belum dapat terapkan'; continue; }
      if (question.id === 'bagian-pilih') { a[question.id] = pick(['Praktik langsung', 'Materi teoretis', 'Diskusi kelompok', 'Studi kasus', '__other__:Studi lapangan']); continue; }
      if (question.id === 'perbaikan') { const v = pick(['Durasi', 'Lokasi/fasilitas', 'Materi contoh', 'Media pembelajaran', '__other__:Rombongan terbang ke kota lain']); a[question.id] = [v, ...(rand() > 0.7 ? [pick(['Durasi', 'Materi contoh'])] : [])]; continue; }
      if (question.id === 'bagian-lain') { if (rand() > 0.6) a[question.id] = pick(['__other__:Sesi mentoring tambahan', '__other__:Webinar ulang materi', '__other__:Lokakarya offline']); continue; }
      if (question.id === 'kesan' || question.id === 'hambatan' || question.id === 'terapkan' || question.id === 'dukungan') {
        if (question.type === 'multiple_choice') { a[question.id] = [pick(['Waktu', 'Fasilitas', 'Dukungan pimpinan', 'Keterampilan diri']), ...(rand() > 0.5 ? [pick(['Waktu', 'Keterampilan diri'])] : [])]; continue; }
        if (question.type === 'likert') { a[question.id] = String(pickBalanced()); continue; }
        a[question.id] = belajar(pickBalanced() > 3.4); continue;
      }
      if (question.type === 'likert') { a[question.id] = String(pickBalanced()); continue; }
      if (question.type === 'yes_no') { a[question.id] = rand() > 0.18 ? 'Ya' : 'Tidak'; continue; }
      if (question.type === 'number') { a[question.id] = String(int(30, 240)); continue; }
      if (question.type === 'single_choice') { a[question.id] = pick(question.options.concat(question.allowOther && rand() > 0.9 ? ['__other__:lainnya'] : [])); continue; }
      if (question.type === 'multiple_choice') { a[question.id] = [pick(question.options), ...(rand() > 0.7 ? [pick(question.options)] : [])].filter((v, i, arr) => arr.indexOf(v) === i); continue; }
      if (question.type === 'short_text') { a[question.id] = pick(peran); continue; }
      if (question.type === 'long_text') { a[question.id] = belajar(pickBalanced() > 3.3); continue; }
    }
    function pickBalanced() { const r = rand(); return r < 0.04 ? 2 : r < 0.13 ? 3 : r < 0.55 ? 4 : 5; }
    return a;
  }

  function makePairedAnswers(qs, bias) {
    const a = { kode: '' };
    for (const question of qs) {
      if (question.id === 'kode') continue;
      if (question.type === 'single_choice' && question.scored) {
        a[question.id] = rand() < bias ? question.correctAnswer : pick(question.options.filter((o) => o !== question.correctAnswer));
      }
    }
    return a;
  }

  const FORM_WINDOW = { pretest: { pre: 7, post: 2 }, posttest: { pre: 2, post: 21 }, evaluasi: { pre: 0, post: 30 }, pra_sesi: { pre: 21, post: 0 }, pasca_sesi: { pre: 0, post: 21 }, tindak_lanjut: { pre: 0, post: 45 }, kebutuhan: { pre: 40, post: 2 } };
  function formWindow(t, type) {
    const s = new Date(t.start_date + 'T00:00:00+07:00').getTime();
    const e = t.end_date ? new Date(t.end_date + 'T00:00:00+07:00').getTime() : s;
    const cfg = FORM_WINDOW[type] || { pre: 0, post: 14 };
    let open = s - cfg.pre * DAY;
    let close = e + cfg.post * DAY;
    const now = Date.now();
    if (close > now - 36e5) close = now - 36e5;
    if (open > close) open = close - DAY;
    return [open, close];
  }

  const SUMMARY = { members: kept.length, trainings: 0, forms: 0, responses: 0, templates: 0, help: 0, audit: 0 };

  const audit = [];
  const logAudit = (actorId, actorName, action, targetId, detail, when) => audit.push([randomUUID(), actorId, actorName, action, targetId, detail, new Date(when).toISOString()]);
  const logFor = (username, action, targetId, detail, when) => { const m = byUsername[username] || admin; logAudit(m.id, m.name, action, targetId, detail, when || Date.now()); };
  const dayAgo = (n) => Date.now() - n * DAY;
  function spreadDays(n, from, to) { return from + rand() * (Math.max(to, from + 1) - from); }

  const stmts = [];

  const TRAININGS = [
    {
      name: 'IHT Penyusunan Modul Ajar Berbasis AI', program: 'IHT', status: 'Selesai', start_date: '2025-01-13', end_date: '2025-01-15', location: 'Daring – Zoom', facilitator: 'Eko Prasetyo, M.Pd.', theme: 'modul ajar',
      details: { timezone: 'WIB', method: 'Online', scheme: 'Sosial', duration: 1080, category: 'Teknologi Pembelajaran', grade_level: 'Semua jenjang', organizer: 'HRP Astra', price: 850000, participant_count: 60, pic: 'Rina Kusuma', co_trainer: 'Dewi Lestari', moderator: 'Bayu Pratama', meeting_link: 'https://zoom.us/j/dummy001', registration_link: 'https://forms.hrp-insight.test/iht-modul-ai', content_link: 'https://drive.hrp-insight.test/modul-ai', description: 'Pelatihan intensif penyusunan modul ajar digital berbantuan AI untuk guru dan instruktur.' },
      access: ['hrp-ira'],
      paired: { codes: 58, preExtra: 3, postExtra: 2, preBias: 0.5, postBias: 0.86, city: 'SBY' },
      forms: [
        { type: 'pretest', title: 'Pre-test Modul Ajar AI', desc: 'Asesmen awal untuk memetakan pemahaman peserta.' },
        { type: 'posttest', title: 'Post-test Modul Ajar AI', desc: 'Asesmen akhir untuk mengukur peningkatan pemahaman.' },
        { type: 'evaluasi', title: 'Evaluasi IHT Modul Ajar AI', desc: 'Umpan balik kualitas penyelenggaraan kegiatan.', n: 70 },
      ],
    },
    {
      name: 'TLC Pemanfaatan AI untuk Asesmen Pembelajaran', program: 'TLC', status: 'Selesai', start_date: '2025-02-10', end_date: '2025-02-12', location: 'Bandung', facilitator: 'Maria Setiawati, S.Pd.', theme: 'asesmen',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 1440, category: 'Asesmen Digital', grade_level: 'SMP', organizer: 'HRP Astra', price: 1200000, participant_count: 48, pic: 'Angga Saputra', moderator: 'Bayu Pratama', registration_link: 'https://forms.hrp-insight.test/tlc-ai-asesmen', description: 'Pelatihan penggunaan teknologi AI untuk merancang dan menganalisis asesmen pembelajaran.' },
      access: [],
      paired: { codes: 48, preExtra: 1, postExtra: 0, preBias: 0.55, postBias: 0.83, city: 'BDG' },
      forms: [
        { type: 'pretest', title: 'Pre-test Asesmen AI', desc: 'Pengukuran awal kompetensi asesmen.' },
        { type: 'posttest', title: 'Post-test Asesmen AI', desc: 'Pengukuran capaian setelah pelatihan.' },
        { type: 'evaluasi', title: 'Evaluasi TLC Asesmen AI', desc: 'Penilaian penyelenggaraan kegiatan.', n: 60 },
      ],
    },
    {
      name: 'Bootcamp Analisis Data dengan Excel Lanjutan', program: 'Bootcamp', status: 'Selesai', start_date: '2025-03-03', end_date: '2025-03-07', location: 'Jakarta', facilitator: 'Hendra Wijaya', theme: 'analisis data',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 3000, category: 'Data & Statistik', grade_level: 'Semua jenjang', organizer: 'HRP Astra', price: 2500000, participant_count: 160, pic: 'Rina Kusuma', co_trainer: 'Angga Saputra', moderator: 'Dewi Lestari', meeting_link: 'https://zoom.us/j/dummy003', description: 'Pelatihan intensif lima hari pengolahan dan visualisasi data pendidikan menggunakan Excel lanjutan.' },
      access: ['hrp-ira'],
      forms: [{ type: 'evaluasi', title: 'Evaluasi Bootcamp Excel Lanjutan', desc: 'Umpan balik kegiatan lima hari.', n: 160 }],
    },
    {
      name: 'Elevate Class Kepemimpinan Instruktur', program: 'Elevate Class', status: 'Selesai', start_date: '2025-04-14', end_date: '2025-04-16', location: 'Surabaya', facilitator: 'Prof. Bambang Riyadi', theme: 'kepemimpinan',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 1320, category: 'Kepemimpinan', grade_level: 'Guru', organizer: 'HRP Astra', price: 950000, participant_count: 90, pic: 'Angga Saputra', moderator: 'Dewi Lestari', registration_link: 'https://forms.hrp-insight.test/elevate-kepemimpinan', content_link: 'https://drive.hrp-insight.test/elevate-lead', description: 'Kelas pengembangan kepemimpinan bagi instruktur dan calon fasilitator.' },
      access: [],
      forms: [
        { type: 'evaluasi', title: 'Evaluasi Elevate Class Kepemimpinan', desc: 'Penilaian kegiatan dan fasilitator.', n: 120 },
        { type: 'tindak_lanjut', title: 'Tindak Lanjut Kepemimpinan Instruktur', desc: 'Pantauan penerapan hasil pelatihan.', n: 70 },
      ],
    },
    {
      name: 'ACCEL Kelas Menulis Artikel Ilmiah', program: 'ACCEL', status: 'Selesai', start_date: '2025-05-19', end_date: '2025-05-23', location: 'Daring – Google Meet', facilitator: 'Dr. Sari Nugroho', theme: 'artikel ilmiah',
      details: { timezone: 'WIB', method: 'Online', scheme: 'Sosial', duration: 2000, category: 'Publikasi Ilmiah', grade_level: 'Semua', organizer: 'HRP Astra', price: 1500000, participant_count: 40, pic: 'Dewi Lestari', moderator: 'Bayu Pratama', meeting_link: 'https://meet.google.com/dummy005', documentation_url: 'https://drive.hrp-insight.test/accel-paper', description: 'Pelatihan akselerasi penulisan artikel ilmiah untuk publikasi jurnal.' },
      access: ['hrp-ira'],
      paired: { codes: 40, preExtra: 0, postExtra: 1, preBias: 0.52, postBias: 0.88, city: 'JKT' },
      forms: [
        { type: 'pretest', title: 'Pre-test Penulisan Artikel', desc: 'Asesmen kemampuan awal menulis.' },
        { type: 'posttest', title: 'Post-test Penulisan Artikel', desc: 'Asesmen akhir materi penulisan.' },
        { type: 'evaluasi', title: 'Evaluasi ACCEL Artikel Ilmiah', desc: 'Umpan balik penyelenggaraan.', n: 40 },
      ],
    },
    {
      name: 'Open Class Literasi Keuangan untuk Guru', program: 'Open Class', status: 'Selesai', start_date: '2025-06-09', end_date: '2025-06-09', location: 'Daring – YouTube', facilitator: 'Tim OJK & HRP', theme: 'literasi keuangan',
      details: { timezone: 'WIB', method: 'Online', scheme: 'Sosial', duration: 180, category: 'Literasi Keuangan', grade_level: 'Semua', organizer: 'HRP Astra', price: 0, participant_count: 200, pic: 'Bayu Pratama', moderator: 'Rina Kusuma', meeting_link: 'https://youtube.com/live/dummy006', description: 'Kelas terbuka literasi keuangan bagi guru dan tenaga kependidikan.' },
      access: ['hrp-ira'],
      forms: [{ type: 'evaluasi', title: 'Evaluasi Open Class Literasi Keuangan', desc: 'Umpan balik kelas terbuka.', n: 200 }],
    },
    {
      name: 'IHT Kurikulum Merdeka Berdiferensiasi', program: 'IHT', status: 'Selesai', start_date: '2025-08-11', end_date: '2025-08-13', location: 'Yogyakarta', facilitator: 'Dra. Endah Wulandari, M.Pd.', theme: 'kurikulum',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Sosial', duration: 1440, category: 'Kurikulum Merdeka', grade_level: 'SD/MI', organizer: 'HRP Astra', price: 700000, participant_count: 72, pic: 'Dewi Lestari', co_trainer: 'Eko Prasetyo', moderator: 'Bayu Pratama', registration_link: 'https://forms.hrp-insight.test/iht-kurikulum', content_link: 'https://drive.hrp-insight.test/berdiferensiasi', description: 'In-house training penetapan pembelajaran berdiferensiasi dalam Kurikulum Merdeka.' },
      access: ['hrp-ira'],
      paired: { codes: 72, preExtra: 2, postExtra: 0, preBias: 0.48, postBias: 0.84, city: 'YOG' },
      forms: [
        { type: 'pretest', title: 'Pre-test Pembelajaran Berdiferensiasi', desc: 'Pemetaan awal pemahaman kurikulum.' },
        { type: 'posttest', title: 'Post-test Pembelajaran Berdiferensiasi', desc: 'Pengukuran hasil pelatihan.' },
        { type: 'evaluasi', title: 'Evaluasi IHT Kurikulum Berdiferensiasi', desc: 'Umpan balik kegiatan.', n: 65 },
      ],
    },
    {
      name: 'Kolaborasi Penelitian Tindakan Kelas', program: 'Kolaborasi', status: 'Berlangsung', start_date: '2025-11-17', end_date: '2025-11-21', location: 'Daring – Zoom', facilitator: 'Dr. Ahmad Fauzi', theme: 'PTK',
      details: { timezone: 'WIB', method: 'Online', scheme: 'Komersil', duration: 2200, category: 'Penelitian', grade_level: 'Semua', organizer: 'LPMP & HRP', price: 1800000, participant_count: 55, pic: 'Rina Kusuma', moderator: 'Angga Saputra', registration_link: 'https://forms.hrp-insight.test/kolaborasi-ptk', meeting_link: 'https://zoom.us/j/dummy008', description: 'Kegiatan kolaborasi penyusunan dan pelaksanaan penelitian tindakan kelas.' },
      access: ['hrp-ira'],
      paired: { codes: 55, preExtra: 1, postExtra: 0, preBias: 0.5, postBias: 0.8, city: 'MDN' },
      forms: [
        { type: 'pretest', title: 'Pre-test PTK', desc: 'Asesmen awal metodologi penelitian.' },
        { type: 'posttest', title: 'Post-test PTK', desc: 'Pengukuran akhir setelah lokakarya.' },
        { type: 'evaluasi', title: 'Evaluasi Kolaborasi PTK', desc: 'Evaluasi proses kegiatan berjalan.', n: 45 },
      ],
    },
    {
      name: 'TLC Fasilitasi Pembelajaran Daring', program: 'TLC', status: 'Berlangsung', start_date: '2026-01-12', end_date: '2026-01-16', location: 'Malang', facilitator: 'Novita Sari, M.Pd.', theme: 'fasilitasi daring',
      details: { timezone: 'WIB', method: 'Hybrid', scheme: 'Komersil', duration: 1600, category: 'Fasilitasi', grade_level: 'Semua', organizer: 'HRP Astra', price: 1300000, participant_count: 90, pic: 'Dewi Lestari', co_trainer: 'Bayu Pratama', moderator: 'Rina Kusuma', content_link: 'https://drive.hrp-insight.test/fasilitasi', group_link: 'https://t.me/hrp_insight_fasilitasi', description: 'Pelatihan kapasitas fasilitator pembelajaran daring dengan praktik langsung.' },
      access: ['hrp-ira'],
      forms: [
        { type: 'pra_sesi', title: 'Pra-Sesi Fasilitasi Daring', desc: 'Survei awal sebelum pelatihan.', n: 90 },
        { type: 'pasca_sesi', title: 'Pasca-Sesi Fasilitasi Daring', desc: 'Refleksi setelah pelatihan.', n: 90 },
      ],
    },
    {
      name: 'Bootcamp Desain Presentasi Efektif', program: 'Bootcamp', status: 'Rencana', start_date: '2026-02-16', end_date: '2026-02-20', location: 'Jakarta', facilitator: 'Belum ditentukan', theme: 'presentasi',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 2400, category: 'Komunikasi', grade_level: 'Semua', organizer: 'HRP Astra', price: 2000000, participant_count: 120, pic: 'Angga Saputra', moderator: 'Rina Kusuma', registration_link: 'https://forms.hrp-insight.test/bootcamp-presentasi', description: 'Rencana bootcamp keterampilan menyusun dan menyampaikan presentasi efektif.' },
      access: [],
      forms: [
        { type: 'pretest', title: 'Pre-test Desain Presentasi', desc: 'Rencana asesmen awal (draft).', status: 'draft' },
        { type: 'evaluasi', title: 'Evaluasi Desain Presentasi', desc: 'Rencana evaluasi (draft).', status: 'draft' },
      ],
    },
    {
      name: 'Research Academy Workshop Statistika Penelitian', program: 'Research Academy', status: 'Berlangsung', start_date: '2026-03-09', end_date: '2026-03-11', location: 'Daring – Zoom', facilitator: 'Dr. Yusuf Hakim', theme: 'statistika',
      details: { timezone: 'WIB', method: 'Online', scheme: 'Komersil', duration: 1200, category: 'Statistika Penelitian', grade_level: 'Semua', organizer: 'HRP & Universitas Mitra', price: 1100000, participant_count: 50, pic: 'Bayu Pratama', co_trainer: 'Angga Saputra', moderator: 'Dewi Lestari', registration_link: 'https://forms.hrp-insight.test/academy-stat', meeting_link: 'https://zoom.us/j/dummy011', description: 'Workshop statistika untuk peneliti dan penyusun karya ilmiah.' },
      access: ['hrp-ira'],
      forms: [{ type: 'kebutuhan', title: 'Survei Kebutuhan Workshop Statistika', desc: 'Pendaftaran dan pemetaan kebutuhan peserta.', n: 50 }],
    },
    {
      name: 'Open Class Parenting Digital', program: 'Open Class', status: 'Selesai', start_date: '2025-09-15', end_date: '2025-09-15', location: 'Surabaya', facilitator: 'Psikolog Nadia Rahmawati', theme: 'parenting',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Sosial', duration: 240, category: 'Parenting', grade_level: 'Orang tua', organizer: 'HRP Astra', price: 0, participant_count: 180, pic: 'Dewi Lestari', moderator: 'Rina Kusuma', documentation_url: 'https://drive.hrp-insight.test/parenting', description: 'Kelas terbuka pengasuhan digital untuk orang tua peserta didik.' },
      access: [],
      forms: [
        { type: 'evaluasi', title: 'Evaluasi Open Class Parenting', desc: 'Umpan balik kelas parenting.', n: 180 },
        { type: 'tindak_lanjut', title: 'Tindak Lanjut Parenting Digital', desc: 'Pantauan penerapan pola asuh digital.', n: 60 },
      ],
    },
    {
      name: 'Training Public Speaking bagi Trainer', program: 'Training', status: 'Selesai', start_date: '2025-02-24', end_date: '2025-02-26', location: 'Semarang', facilitator: 'Rudi Hartono, S.E.', theme: 'public speaking',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 1200, category: 'Public Speaking', grade_level: 'Trainer', organizer: 'HRP Astra', price: 900000, participant_count: 120, pic: 'Bayu Pratama', co_trainer: 'Novita Sari', moderator: 'Dewi Lestari', registration_link: 'https://forms.hrp-insight.test/public-speaking', content_link: 'https://drive.hrp-insight.test/speaking', description: 'Pelatihan keterampilan berbicara di depan umum bagi calon trainer.' },
      access: ['hrp-ira'],
      forms: [{ type: 'evaluasi', title: 'Evaluasi Public Speaking Trainer', desc: 'Umpan balik penyelenggaraan.', n: 120 }],
    },
    {
      name: 'Elevate Class Transformasi Digital Pembelajaran', program: 'Elevate Class', status: 'Berlangsung', start_date: '2026-05-18', end_date: '2026-05-20', location: 'Jakarta', facilitator: 'Ibu Ratna Komala, M.M.', theme: 'transformasi digital',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Komersil', duration: 1080, category: 'Digitalisasi', grade_level: 'Semua', organizer: 'HRP Astra', price: 1000000, participant_count: 45, pic: 'Rina Kusuma', moderator: 'Angga Saputra', meeting_link: 'https://zoom.us/j/dummy014', content_link: 'https://drive.hrp-insight.test/transformasi', description: 'Kelas pengembangan transformasi digital pembelajaran bagi sekolah mitra.' },
      access: [],
      forms: [{ type: 'evaluasi', title: 'Evaluasi Transformasi Digital', desc: 'Umpan balik kelas digitalisasi.', n: 45 }],
    },
    {
      name: 'IHT Asesmen Diagnostik', program: 'IHT', status: 'Selesai', start_date: '2025-05-05', end_date: '2025-05-07', location: 'Palembang', facilitator: 'Sukma Wijaya, M.Pd.', theme: 'asesmen diagnostik',
      details: { timezone: 'WIB', method: 'Offline', scheme: 'Sosial', duration: 1320, category: 'Asesmen', grade_level: 'SD–SMA', organizer: 'HRP Astra', price: 650000, participant_count: 150, pic: 'Dewi Lestari', co_trainer: 'Eko Prasetyo', moderator: 'Rina Kusuma', registration_link: 'https://forms.hrp-insight.test/iht-diagnostik', documentation_url: 'https://drive.hrp-insight.test/diagnostik', description: 'Pelatihan merancang dan menginterpretasi asesmen diagnostik kognitif dan non-kognitif.' },
      access: ['hrp-ira'],
      forms: [{ type: 'evaluasi', title: 'Evaluasi IHT Asesmen Diagnostik', desc: 'Umpan balik kegiatan.', n: 150 }],
    },
  ];

  const formStatuses = { published: 'published', closed: 'closed' };
  for (const [tIdx, spec] of TRAININGS.entries()) {
    const tid = randomUUID();
    const created = spreadDays(560, Date.now() - 560 * DAY, spec.start_date ? new Date(spec.start_date + 'T00:00:00+07:00').getTime() : Date.now());
    const when = new Date(Math.min(created, Date.now() - 5 * DAY)).toISOString();
    const details = { version: 1, ...spec.details };
    const description = spec.details.description || '';
    const [bannerTop, bannerBottom] = BANNER_PALETTES[tIdx % BANNER_PALETTES.length];
    const bannerKey = 'banners/' + tid + '/' + randomUUID();
    const bannerBytes = bannerPng(1280, 360, bannerTop, bannerBottom);
    if (bucket) await bucket.put(bannerKey, bannerBytes, { httpMetadata: { contentType: 'image/png' } });
    const bannerJson = JSON.stringify({ key: bannerKey, mime: 'image/png', size: bannerBytes.length });
    stmts.push(db.prepare('INSERT INTO trainings (id,name,program,status,start_date,end_date,location,facilitator,details_json,created_by,created_at,updated_at,banner) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(tid, spec.name, spec.program, spec.status, spec.start_date, spec.end_date, spec.location, spec.facilitator, JSON.stringify(details), admin.id, when, when, bannerJson));
    logAudit(admin.id, admin.name, 'training.create', tid, '', when);
    SUMMARY.trainings++;

    const assigned = new Set();
    for (const username of spec.access) {
      const m = byUsername[username];
      if (m && !assigned.has(m.id)) { assigned.add(m.id); stmts.push(db.prepare('INSERT INTO training_members (training_id,member_id) VALUES (?,?)').bind(tid, m.id)); }
    }
    for (const m of Object.values(byUsername)) {
      if (m.role === 'staff' && !assigned.has(m.id)) { assigned.add(m.id); stmts.push(db.prepare('INSERT INTO training_members (training_id,member_id) VALUES (?,?)').bind(tid, m.id)); }
    }

    let seedOff = 0;
    for (const fs of spec.forms) {
      const fid = randomUUID();
      const token = randomToken();
      const lockHash = await sha256(token);
      const lockCipher = await encrypt(DATA_KEY, token, 'share:' + fid);
      const status = fs.status || (fs.responses && fs.responses > 0 ? 'published' : spec.status === 'Rencana' ? 'draft' : 'published');

      let questions = [];
      let pairId = null;
      if (fs.type === 'pretest' || fs.type === 'posttest') { questions = skillQuestions(seedOff++); pairId = 'kode'; }
      else if (fs.type === 'evaluasi') questions = evaluasiQuestions(seedOff++, spec.theme);
      else if (fs.type === 'pra_sesi' || fs.type === 'pasca_sesi') questions = praPascaQuestions(fs.type === 'pra_sesi' ? 'pra' : 'pasca');
      else if (fs.type === 'tindak_lanjut') questions = tindakLanjutQuestions(spec.theme);
      else if (fs.type === 'kebutuhan') questions = kebutuhanQuestions();
      else questions = [];

      const createdForm = spreadDays(30, new Date(spec.start_date + 'T00:00:00+07:00').getTime() - 30 * DAY, new Date(spec.start_date + 'T00:00:00+07:00').getTime());
      const createdFormIso = new Date(createdForm).toISOString();
      stmts.push(db.prepare('INSERT INTO forms (id,training_id,title,type,description,questions_json,status,share_hash,share_cipher,expires_at,pair_question_id,version,revision,locked_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(fid, tid, fs.title, fs.type, fs.desc, JSON.stringify(questions), status, lockHash, lockCipher, null, pairId, 1, 1, null, admin.id, createdFormIso, createdFormIso));
      logAudit(admin.id, admin.name, 'form.create', fid, '', createdFormIso);
      SUMMARY.forms++;

      const [winOpen, winClose] = formWindow(spec, fs.type);
      let firstSubmitted = null;

      const kind = spec.paired && (fs.type === 'pretest' || fs.type === 'posttest') ? 'paired' : 'anon';
      const nAnon = kind === 'anon' ? (fs.responses ?? fs.n ?? 0) : 0;
      if (fs.status === 'draft' || !nAnon && kind === 'anon') continue;
      const isPre = fs.type === 'pretest';

      if (kind === 'paired') {
        const p = spec.paired;
        const codes = [];
        const total = p.codes + (isPre ? p.preExtra : p.postExtra);
        for (let i = 1; i <= total; i++) codes.push(p.city + '-' + String(i).padStart(3, '0'));
        const bias = isPre ? p.preBias : p.postBias;
        for (const code of codes) {
          const qs = questions;
          const answers = makePairedAnswers(qs, bias);
          answers.kode = code;
          const rid = randomUUID();
          const pkey = await keyedHash(DATA_KEY, 'pair:' + tid + ':' + normalize(code));
          const submitted = spreadDays(0, winOpen, winClose);
          const submittedIso = new Date(submitted).toISOString();
          const score = computeScore(qs, answers);
          if (!firstSubmitted) firstSubmitted = submittedIso;
          stmts.push(db.prepare('INSERT INTO responses (id,form_id,participant_key,pairing_basis,answers_cipher,score,max_score,request_id,receipt,consent_at,privacy_snapshot,expires_at,excluded,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)').bind(rid, fid, pkey, 'field', await encrypt(DATA_KEY, answers, 'answers:' + rid), score.score, score.max_score, randomUUID(), randomToken().slice(0, 16).toUpperCase(), submittedIso, privacySnapshot, new Date(submitted + workspace.retention_days * DAY).toISOString(), submittedIso));
          SUMMARY.responses++;
        }
      } else {
        for (let i = 0; i < nAnon; i++) {
          const answers = makeAnonAnswers({ questions }, spec.theme);
          const rid = randomUUID();
          const submitted = spreadDays(0, winOpen, winClose);
          const submittedIso = new Date(submitted).toISOString();
          const pkey = await keyedHash(DATA_KEY, 'response:' + rid);
          const score = computeScore(questions, answers);
          if (!firstSubmitted) firstSubmitted = submittedIso;
          const exclude = i === 2 && nAnon > 40;
          stmts.push(db.prepare('INSERT INTO responses (id,form_id,participant_key,pairing_basis,answers_cipher,score,max_score,request_id,receipt,consent_at,privacy_snapshot,expires_at,excluded,exclusion_reason,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(rid, fid, pkey, 'none', await encrypt(DATA_KEY, answers, 'answers:' + rid), score.score, score.max_score, randomUUID(), randomToken().slice(0, 16).toUpperCase(), submittedIso, privacySnapshot, new Date(submitted + workspace.retention_days * DAY).toISOString(), exclude ? 1 : 0, exclude ? 'Jawaban duplikat pada kualitas data' : null, submittedIso));
          SUMMARY.responses++;
        }
      }

      if (firstSubmitted && status !== 'draft') {
        stmts.push(db.prepare("UPDATE forms SET locked_at=? WHERE id=?").bind(firstSubmitted, fid));
      }
      if (status === 'published') logAudit(admin.id, admin.name, 'form.published', fid, '', new Date(firstSubmitted || createdFormIso).toISOString());
    }
  }

  const TEMPLATES = [
    ['Evaluasi Kegiatan Pelatihan', 'evaluasi', 'Template baku umpan balik pelatihan lima skala Likert.', evaluasiQuestions(55, 'pelatihan')],
    ['Pre-test Materi Pelatihan', 'pretest', 'Template asesmen awal 10 butir pilihan ganda berbobot.', skillQuestions(10)],
    ['Post-test Materi Pelatihan', 'posttest', 'Template asesmen akhir setara pre-test.', skillQuestions(11)],
    ['Survei Kebutuhan Pelatihan', 'kebutuhan', 'Template pemetaan kebutuhan kandidat peserta.', kebutuhanQuestions()],
    ['Tindak Lanjut Pasca Pelatihan', 'tindak_lanjut', 'Template pantauan penerapan hasil belajar.', tindakLanjutQuestions('pelatihan')],
  ];
  for (const [title, type, desc2, questions] of TEMPLATES) {
    const ttid = randomUUID();
    stmts.push(db.prepare('INSERT INTO templates (id,title,type,description,questions_json,version,created_by,created_at) VALUES (?,?,?,?,?,1,?,?)').bind(ttid, title, type, desc2, JSON.stringify(questions), admin.id, new Date(spreadDays(200, Date.now() - 200 * DAY, Date.now() - 40 * DAY)).toISOString()));
    SUMMARY.templates++;
  }

  const HELP = [
    ['hrp-ira', 'bug', 'Halaman formulir tidak bisa dibuka saat mengisi pretest di ponsel.', 'baru', 12],
    ['hrp-ira', 'bug', 'Tombol unduh CSV pada daftar respons mengunduh file kosong saat filter aktif.', 'diproses', 20],
    ['hrp-ira', 'saran', 'Tambahkan fitur rekap otomatis ke format PDF dari halaman laporan.', 'selesai', 34],
    ['dewi-hrp', 'saran', 'Mohon ada pencarian cepat pada daftar kegiatan agar lebih efisien.', 'diproses', 16],
    ['rina-hrp', 'bug', 'Notifikasi Telegram tidak terkirim ketika kiriman membantu diterima.', 'selesai', 8],
    ['bayu-hrp', 'saran', 'Tambahkan opsi ekspor grafik laporan menjadi gambar PNG.', 'baru', 5],
    ['angga-hrp', 'saran', 'Daftar kegiatan tolong ditambah kolom filter berdasarkan periode tahun.', 'ditolak', 40],
    ['dewi-hrp', 'bug', 'Pratinjau formulir menampilkan skor meski pada mode peserta.', 'selesai', 25],
  ];
  for (const [username, category, message, status, daysAgo] of HELP) {
    const hid = randomUUID();
    const m = byUsername[username] || admin;
    const when = new Date(spreadDays(0, Date.now() - daysAgo * DAY, Date.now())).toISOString();
    stmts.push(db.prepare('INSERT INTO help (id,author_id,author_name,category,message,media_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(hid, m.id, m.name, category, message, null, status, when, when));
    logAudit(m.id, m.name, 'help.create', hid, category === 'bug' ? 'Laporan error/bug' : 'Saran pengembangan', when);
    SUMMARY.help++;
  }

  const nowMs = Date.now();
  logAudit(admin.id, admin.name, 'workspace.setup.local', 'hrp-insight', '', spreadDays(0, nowMs - 560 * DAY, nowMs - 540 * DAY));
  logAudit(admin.id, admin.name, 'privacy.update', 'hrp-insight', '', spreadDays(0, nowMs - 300 * DAY, nowMs - 290 * DAY));
  for (let i = 0; i < 22; i++) {
    const username = pick(Object.keys(byUsername));
    const m = byUsername[username];
    const when = Date.now() - int(0, 28) * DAY - int(0, 20) * 3600000;
    logAudit(m.id, m.name, 'auth.login', m.id, '', when);
    if (rand() > 0.5) logAudit(m.id, m.name, 'auth.logout', m.id, '', when + 2 * 3600000);
  }
  for (const username of Object.keys(byUsername)) {
    const m = byUsername[username];
    if (m.role === 'admin') continue;
    logAudit(admin.id, admin.name, 'member.create', m.id, '', spreadDays(0, nowMs - 500 * DAY, nowMs - 350 * DAY));
  }
  if (byUsername['hrp-ira']) {
    const m = byUsername['hrp-ira'];
    logAudit(m.id, m.name, 'account.password', m.id, '', spreadDays(0, nowMs - 340 * DAY, nowMs - 300 * DAY));
  }
  logAudit(admin.id, admin.name, 'responses.read', null, '', spreadDays(0, nowMs - 14 * DAY, nowMs - 1 * DAY));
  logAudit(admin.id, admin.name, 'responses.export', null, '', spreadDays(0, nowMs - 10 * DAY, nowMs - 2 * DAY));
  logAudit('hrp-ira' in byUsername ? byUsername['hrp-ira'].id : admin.id, (byUsername['hrp-ira'] || admin).name, 'response.exclude', null, 'Keputusan kualitas data disimpan', spreadDays(0, nowMs - 6 * DAY, nowMs - 1 * DAY));

  for (const row of audit) {
    stmts.push(db.prepare('INSERT INTO audit (id,actor_id,actor_name,action,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)').bind(row[0], row[1], row[2], row[3], row[4], row[5], row[6]));
    SUMMARY.audit++;
  }

  console.log('  Menyimpan ' + SUMMARY.responses + ' respons, ' + SUMMARY.forms + ' formulir, ' + SUMMARY.trainings + ' kegiatan…');
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  for (const group of chunk(stmts, 60)) {
    const results = await db.batch(group);
    for (const r of results) if (r && r.meta && r.meta.error) throw new Error(r.meta.error);
  }

  const s = await db.prepare('SELECT (SELECT COUNT(*) FROM trainings) AS t,(SELECT COUNT(*) FROM forms) AS f,(SELECT COUNT(*) FROM responses) AS r,(SELECT COUNT(*) FROM members) AS m,(SELECT COUNT(*) FROM templates) AS tp,(SELECT COUNT(*) FROM help) AS h,(SELECT COUNT(*) FROM audit) AS a,(SELECT COUNT(*) FROM rate_limits) AS rl,(SELECT COUNT(*) FROM trainings WHERE banner IS NOT NULL) AS b').first();
  console.log('\nSeed selesai!');
  console.log('  Kegiatan  : ' + s.t);
  console.log('  Banner    : ' + s.b);
  console.log('  Formulir  : ' + s.f);
  console.log('  Respons   : ' + s.r);
  console.log('  Tim       : ' + s.m);
  console.log('  Template  : ' + s.tp);
  console.log('  Bantuan   : ' + s.h);
  console.log('  Audit     : ' + s.a);
  console.log('\nAkun lama tetap berlaku dengan sandi tidak berubah: ' + Object.keys(byUsername).join(', ') + '.');
  console.log('Tidak ada akun demo tambahan yang dibuat. Staf yang ada diberi akses semua kegiatan contoh.');
  console.log('\nJalankan npm run dev lalu buka http://localhost:5173.');
} finally {
  await proxy.dispose();
}