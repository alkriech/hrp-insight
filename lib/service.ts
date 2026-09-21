import { z } from 'zod';
import { PROGRAMS, STATUSES, FORM_TYPES, cleanQuestions, publicQuestions, validateAnswers, computeScore, normalize, csv, mean, type Question } from './domain';
import { encrypt, decrypt, sha256, keyedHash, randomToken, readJson, requireMutationOrigin, secureResponse, HttpError, fail } from './security';
import { hashPassword, verifyPassword } from './password';
export type AppEnv = {
    DB: any;
    BUCKET: any;
    DATA_KEY: string;
    APP_ORIGIN: string;
    SETUP_MODE?: string;
    SETUP_CODE?: string;
    TELEGRAM_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
};
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Username 3–40 karakter: huruf kecil, angka, titik, garis bawah, hubung.'), password: z.string().min(1).max(128) });
const WEAK_PASSWORDS = new Set(['password', 'password1', 'password123', 'password1234', 'passw0rd', '12345678', '123456789', '1234567890', '12345678901', '12341234', '12344321', '11111111', '00000000', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'admin123', 'admin1234', 'root1234', 'test1234', 'letmein', 'welcome', 'welcome1', 'iloveyou', 'iloveyou123', 'abc12345', 'monkey123', 'dragon123', 'master123', 'sunshine123', 'princess123', 'football123']);
const strongPassword = z.string().min(8, 'Sandi minimal 8 karakter.').max(128, 'Sandi maksimal 128 karakter.').refine(p => !WEAK_PASSWORDS.has(p.trim().toLowerCase()), 'Sandi terlalu umum dan mudah ditebak.');
const assertPassword = (password: unknown, username?: string) => { const p = String(password ?? ''), normalized = p.trim().toLowerCase(); if (username && (normalized === username.toLowerCase() || normalized.endsWith('123') && normalized === username.toLowerCase() + '123'))
        fail(400, 'Sandi tidak boleh sama dengan username.'); return strongPassword.parse(password); };
const trainingInput = z.object({ name: z.string().trim().min(1).max(200), program: z.enum(PROGRAMS), status: z.enum(STATUSES), start_date: z.string().max(10).default(''), end_date: z.string().max(10).default(''), location: z.string().max(300).default(''), facilitator: z.string().max(200).default(''), details: z.record(z.union([z.string().max(4000), z.number().finite()])).default({}), version: z.number().int().optional() });
const json = (data: unknown, status = 200) => Response.json(data, { status });
const safeMember = (m: any) => ({ id: m.id, name: m.name, username: m.username, role: m.role, active: m.active, must_change_password: m.must_change_password, totp_enabled: !!m.totp_cipher });
export function createService(env: AppEnv) {
    const db = env.DB;
    const stmt = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
    const one = async (sql: string, ...args: unknown[]) => stmt(sql, ...args).first();
    const all = async (sql: string, ...args: unknown[]) => (await stmt(sql, ...args).all()).results;
    const run = async (sql: string, ...args: unknown[]) => stmt(sql, ...args).run();
    const auditStmt = (user: any, action: string, target: string | null = null, detail = '') => stmt('INSERT INTO audit (id,actor_id,actor_name,action,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)', id(), user?.id ?? null, user?.name ?? 'Peserta', action, target, detail, now());
    const log = async (user: any, action: string, target: string | null = null, detail = '') => auditStmt(user, action, target, detail).run();
    const notifyTelegram = async (category: string, author: string, text: string) => { try { const token = env.TELEGRAM_TOKEN, chatId = env.TELEGRAM_CHAT_ID; if (!token || !chatId)
        return; const label = category === 'bug' ? 'Laporan error/bug 🐛' : 'Saran pengembangan 💡'; try { const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: '🔔 ' + label + '\n\nDari: ' + author + '\n\n' + text.slice(0, 500) }) }); if (!res.ok) console.error('HRP Insight Telegram status', res.status, await res.text().catch(() => '')); }
    catch (e) { console.error('HRP Insight Telegram kirim gagal:', e instanceof Error ? e.message : String(e)); } }
    catch { } };
    async function rate(key: string, limit: number, seconds = 600) { const time = Math.floor(Date.now() / 1000); const bucket = Math.floor(time / seconds); const k = await keyedHash(env.DATA_KEY, 'rate:' + key + ':' + bucket); const row = await one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', k, time + seconds); if (row.count > limit)
        fail(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'); }
    async function rateCheck(key: string, limit: number, seconds = 600) { const time = Math.floor(Date.now() / 1000); const bucket = Math.floor(time / seconds); const k = await keyedHash(env.DATA_KEY, 'rate:' + key + ':' + bucket); const row = await one('SELECT count FROM rate_limits WHERE key=?', k); if ((row?.count ?? 0) >= limit)
        fail(429, 'Terlalu banyak percobaan. Tunggu beberapa menit.'); }
    async function rateBump(key: string, seconds = 600) { const time = Math.floor(Date.now() / 1000); const bucket = Math.floor(time / seconds); const k = await keyedHash(env.DATA_KEY, 'rate:' + key + ':' + bucket); await one('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', k, time + seconds); }
    async function getSession(request: Request) { const token = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-hrp-insight_session=([a-f0-9]{64})(?:;|$)/)?.[1]; if (!token)
        return null; const hash = await sha256(token); const t = Date.now(); const session = await one('SELECT s.hash,s.reauth_at,s.expires_at,s.last_seen,m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.hash=? AND s.expires_at>? AND s.last_seen>? AND m.active=1', hash, t, t - 60 * 60 * 1000); if (!session)
        return null; if (session.last_seen < t - 60000)
        await run('UPDATE sessions SET last_seen=? WHERE hash=?', t, hash); return session; }
    async function requireUser(request: Request) { const u = await getSession(request); if (!u)
        fail(401, 'Masuk untuk melanjutkan.'); return u; }
    const requireAdmin = (u: any) => { if (u.role !== 'admin')
        fail(403, 'Hanya admin yang dapat melakukan ini.'); };
    const requireEditor = (u: any) => { if (u.role === 'analyst')
        fail(403, 'Akun analis hanya dapat membaca hasil agregat.'); if (u.must_change_password)
        fail(403, 'Ganti sandi sementara.'); };
    const requireRecent = (u: any) => { if (u.reauth_at < Date.now() - 5 * 60000)
        fail(428, 'Konfirmasikan sandi untuk melanjutkan.'); };
    async function trainingAccess(u: any, trainingId: string) { const t = await one('SELECT * FROM trainings WHERE id=?', trainingId); if (!t)
        fail(404, 'Kegiatan tidak ditemukan.'); if (u.role !== 'admin' && t.created_by !== u.id && !await one('SELECT 1 FROM training_members WHERE training_id=? AND member_id=?', trainingId, u.id))
        fail(404, 'Kegiatan tidak ditemukan.'); return t; }
    async function formAccess(u: any, formId: string) { const f = await one('SELECT * FROM forms WHERE id=?', formId); if (!f)
        fail(404, 'Formulir tidak ditemukan.'); await trainingAccess(u, f.training_id); return f; }
    async function formData(f: any, withShare = false, analyst = false) { const { questions_json, share_hash, share_cipher, ...rest } = f; return { ...rest, questions: analyst ? publicQuestions(JSON.parse(questions_json)) : JSON.parse(questions_json), ...(withShare ? { share_code: await decrypt(env.DATA_KEY, share_cipher, 'share:' + f.id) } : {}) }; }
    async function newForm(u: any, trainingId: string, b: any, source?: any) { await trainingAccess(u, trainingId); const title = z.string().trim().min(1).max(200).parse(b.title); const type = z.enum(FORM_TYPES.map(x => x[0]) as [
        string,
        ...string[]
    ]).parse(b.type); const questions = cleanQuestions(source?.questions ?? b.questions ?? []); const fid = id(), token = randomToken(), time = now(); await db.batch([stmt('INSERT INTO forms (id,training_id,title,type,description,questions_json,share_hash,share_cipher,pair_question_id,version,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', fid, trainingId, title, type, source?.description ?? '', JSON.stringify(questions), await sha256(token), await encrypt(env.DATA_KEY, token, 'share:' + fid), source?.pair_question_id ?? null, source?.version ? source.version + 1 : 1, u.id, time, time), auditStmt(u, 'form.create', fid)]); return { id: fid }; }
    async function publicForm(request: Request, formId: string) { const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''; if (!/^[a-f0-9]{64}$/.test(token))
        fail(404, 'Tautan formulir tidak berlaku.'); const f = await one('SELECT f.*,t.name AS training_name,t.banner AS training_banner FROM forms f JOIN trainings t ON t.id=f.training_id WHERE f.id=? AND f.share_hash=?', formId, await sha256(token)); if (!f || f.status !== 'published' || (f.expires_at && f.expires_at <= now()))
        fail(404, 'Formulir belum dibuka, ditutup, atau tautan tidak berlaku.'); return f; }
    async function rawResponses(f: any) { const rows = await all('SELECT * FROM responses WHERE form_id=? AND expires_at>? ORDER BY submitted_at DESC LIMIT 5001', f.id, now()); if (rows.length > 5000)
        fail(422, 'Formulir melebihi 5.000 respons. Hubungi admin untuk ekspor database.'); return Promise.all(rows.map(async (r: any) => ({ id: r.id, participant_key: r.participant_key, pairing_basis: r.pairing_basis, score: r.score, max_score: r.max_score, submitted_at: r.submitted_at, excluded: r.excluded, exclusion_reason: r.exclusion_reason, receipt: r.receipt, answers: await decrypt(env.DATA_KEY, r.answers_cipher, 'answers:' + r.id) }))); }
    async function report(u: any, trainingId: string, preId?: string | null, postId?: string | null) {
        const t = await trainingAccess(u, trainingId);
        const fs = await all('SELECT * FROM forms WHERE training_id=? ORDER BY created_at', t.id);
        const results = [];
        for (const f of fs) {
            const allRows = await rawResponses(f);
            const rows = allRows.filter((r: any) => !r.excluded);
            const qs: Question[] = JSON.parse(f.questions_json);
            const stats = qs.filter(q => !['section', 'pagebreak'].includes(q.type)).map(q => { const values = rows.map((r: any) => r.answers[q.id]).filter((v: any) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)); const opts = q.type === 'yes_no' ? ['Ya', 'Tidak'] : q.type === 'likert' ? Array.from({ length: q.scale }, (_, i) => String(i + 1)) : q.options; const distribution = opts.map(option => ({ option, count: values.filter((v: any) => Array.isArray(v) ? v.includes(option) : String(v) === option).length })); const otherCount = values.filter((v: any) => (Array.isArray(v) ? v : [v]).some((s: any) => String(s).startsWith('__other__:'))).length; if (otherCount)
                distribution.push({ option: 'Lainnya', count: otherCount }); return { id: q.id, label: q.label, type: q.type, answered: values.length, missing: rows.length - values.length, mean: ['likert', 'number'].includes(q.type) ? mean(values.map(Number)) : null, distribution }; });
            results.push({ id: f.id, title: f.title, type: f.type, version: f.version, questions: stats, n: rows.length, excluded: allRows.length - rows.length, score_mean: mean(rows.filter((r: any) => r.max_score > 0).map((r: any) => r.score / r.max_score * 100)), rows });
        }
        const pre = results.find(f => f.id === preId) ?? results.find(f => f.type === 'pretest');
        const post = results.find(f => f.id === postId) ?? results.find(f => f.type === 'posttest');
        const matches: any[] = [];
        if (pre && post) {
            const a = new Map(pre.rows.filter((r: any) => r.pairing_basis === 'field' && r.max_score > 0).map((r: any) => [r.participant_key, r]));
            for (const r of post.rows.filter((r: any) => r.pairing_basis === 'field' && r.max_score > 0)) {
                const p: any = a.get(r.participant_key);
                if (p)
                    matches.push({ pre: p.score / p.max_score * 100, post: r.score / r.max_score * 100 });
            }
        }
        return { training: { ...t, banner: !!t.banner, details: JSON.parse(t.details_json) }, forms: results.map(({ rows, ...f }) => f), pairing: { pre_id: pre?.id ?? null, post_id: post?.id ?? null, n: matches.length, pre_mean: mean(matches.map(x => x.pre)), post_mean: mean(matches.map(x => x.post)), gain: mean(matches.map(x => x.post - x.pre)), unmatched_pre: (pre?.rows.length ?? 0) - matches.length, unmatched_post: (post?.rows.length ?? 0) - matches.length }, generated_at: now() };
    }
    async function handle(request: Request): Promise<Response> {
        const url = new URL(request.url), parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean), method = request.method;
        if (!db)
            fail(503, 'Penyimpanan tidak tersedia. Coba lagi.');
        if (!['GET', 'HEAD'].includes(method))
            requireMutationOrigin(request, env.APP_ORIGIN);
        const body = async () => readJson(request);
        if (parts[0] === 'session' && method === 'GET') {
            const ws = await one('SELECT * FROM workspace WHERE id=?', 'hrp-insight');
            const u = await getSession(request);
            return json({ needs_setup: !ws, user: u ? safeMember(u) : null, workspace: u ? ws : null });
        }
        if (parts[0] === 'setup' && method === 'POST') {
            if (env.SETUP_MODE !== 'owner-private')
                fail(403, 'Penyiapan awal hanya untuk pemilik situs.');
            if (!request.headers.get('oai-authenticated-user-id'))
                fail(403, 'Penyiapan awal hanya untuk pemilik situs.');
            if (await one('SELECT 1 FROM workspace WHERE id=?', 'hrp-insight'))
                fail(409, 'Admin sudah dibuat. Masuk.');
            await rate('setup', 5);
            const b = await body();
            if (env.SETUP_CODE) {
                const expected = await keyedHash(env.DATA_KEY, 'setup:' + env.SETUP_CODE);
                const provided = await keyedHash(env.DATA_KEY, 'setup:' + String(b.setup_code ?? ''));
                if (expected.length !== provided.length || expected !== provided)
                    fail(403, 'Kode penyiapan tidak sesuai.');
            }
            const c = credentials.parse(b);
            assertPassword(c.password, c.username);
            const name = z.string().trim().min(1).max(100).parse(b.name);
            const mid = id(), time = now();
            await db.batch([stmt('INSERT INTO members (id,username,password_hash,name,role,created_at) VALUES (?,?,?,?,?,?)', mid, c.username, await hashPassword(c.password), name, 'admin', time), stmt('INSERT INTO workspace (id,name,owner_id,created_at) VALUES (?,?,?,?)', 'hrp-insight', 'HRP Insight', mid, time), auditStmt({ id: mid, name }, 'workspace.setup', 'hrp-insight')]);
            return loginResponse({ id: mid });
        }
        if (parts[0] === 'login' && method === 'POST') {
            const b = await body();
            const c = credentials.parse(b);
            await rate('login-ip:' + (request.headers.get('cf-connecting-ip') ?? 'unknown'), 20);
            await rate('login-user:' + c.username, 8);
            await rateCheck('login-fail:' + c.username, 5, 1800);
            const u = await one('SELECT * FROM members WHERE username=?', c.username);
            const dummy = 'scrypt:16384:8:5:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';
            const valid = await verifyPassword(c.password, u?.password_hash ?? dummy);
            if (!u || !valid || !u.active) {
                await rateBump('login-fail:' + c.username, 1800);
                await log(null, 'auth.failed', null);
                fail(401, 'Username atau sandi tidak sesuai.');
            }
            if (u.totp_cipher) {
                if (!b.otp)
                    fail(422, 'Masukkan kode autentikator.');
                await checkTotp(u, String(b.otp));
            }
            await log(u, 'auth.login', u.id);
            return loginResponse(u);
        }
        if (parts[0] === 'public' && parts[1] === 'landing') {
            await rate('landing:' + (request.headers.get('cf-connecting-ip') ?? 'unknown'), 200, 60);
            const ws = await one('SELECT name,landing_request_url,landing_feedback_url FROM workspace WHERE id=?', 'hrp-insight');
            return json({ name: ws?.name ?? 'HRP Insight', request_url: ws?.landing_request_url ?? '', feedback_url: ws?.landing_feedback_url ?? '' });
        }
        if (parts[0] === 'public') {
            const fid = parts[1];
            await rate('public:' + (request.headers.get('cf-connecting-ip') ?? 'unknown'), 200, 60);
            const f = await publicForm(request, fid);
            const ws = await one('SELECT privacy_notice,privacy_contact,retention_days,name FROM workspace WHERE id=?', 'hrp-insight');
            if (method === 'GET' && parts[2] === 'banner') { const item = f.training_banner ? JSON.parse(f.training_banner) as { key: string; mime: string; size: number } : null; if (!item?.key)
                fail(404, 'Gambar tidak ditemukan.');
                const file = await env.BUCKET.get(item.key);
                if (!file)
                    fail(404, 'Gambar tidak tersedia.');
                return new Response(file.body, { headers: { 'Content-Type': item.mime, 'Content-Length': String(item.size), 'Content-Security-Policy': "default-src 'none'; sandbox" } });
            }
            if (method === 'GET' && parts.length === 2)
                return json({ id: f.id, title: f.title, description: f.description, training_name: f.training_name, banner: !!f.training_banner, revision: f.revision, questions: publicQuestions(JSON.parse(f.questions_json)), privacy: ws, expires_at: f.expires_at });
            if (method === 'POST' && parts[2] === 'responses') {
                await rate('submit:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') + ':' + fid, 30, 600);
                const b = await body();
                if (b.hp) fail(400, 'Pengiriman gagal. Muat ulang halaman.');
                if (b.consent !== true)
                    fail(400, 'Persetujuan penggunaan data diperlukan.');
                const requestId = z.string().uuid().parse(b.request_id);
                if (b.revision !== f.revision)
                    fail(409, 'Formulir telah diperbarui. Muat ulang sebelum mengirim.');
                const previous = await one('SELECT receipt FROM responses WHERE form_id=? AND request_id=?', fid, requestId);
                if (previous)
                    return json(previous);
                let answers;
                try {
                    answers = validateAnswers(JSON.parse(f.questions_json), b.answers);
                }
                catch (e) {
                    fail(400, e instanceof Error ? e.message : 'Jawaban tidak valid.');
                }
                const pairValue = f.pair_question_id ? answers![f.pair_question_id] : null;
                if (f.pair_question_id && (typeof pairValue !== 'string' || !pairValue.trim()))
                    fail(400, 'Lengkapi jawaban untuk pencocokan.');
                const rid = id(), participantKey = pairValue ? await keyedHash(env.DATA_KEY, 'pair:' + f.training_id + ':' + normalize(pairValue as string)) : await keyedHash(env.DATA_KEY, 'response:' + rid);
                const score = computeScore(JSON.parse(f.questions_json), answers!);
                const receipt = randomToken().slice(0, 16).toUpperCase();
                const time = now(), expiry = new Date(Date.now() + ws.retention_days * 86400000).toISOString();
                try {
                    const r = await db.batch([stmt('INSERT INTO responses (id,form_id,participant_key,pairing_basis,answers_cipher,score,max_score,request_id,receipt,consent_at,privacy_snapshot,expires_at,submitted_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM forms WHERE id=? AND status=? AND revision=? AND (expires_at IS NULL OR expires_at>?))', rid, fid, participantKey, pairValue ? 'field' : 'none', await encrypt(env.DATA_KEY, answers, 'answers:' + rid), score.score, score.max_score, requestId, receipt, time, JSON.stringify(ws), expiry, time, fid, 'published', b.revision, time), stmt('UPDATE forms SET locked_at=COALESCE(locked_at,?) WHERE id=? AND EXISTS (SELECT 1 FROM responses WHERE id=?)', time, fid, rid)]);
                    if (!r[0].meta.changes)
                        fail(409, 'Formulir berubah atau sudah ditutup. Jawaban belum dikirim.');
                }
                catch (e) {
                    if (e instanceof HttpError)
                        throw e;
                    const duplicate = await one('SELECT receipt FROM responses WHERE form_id=? AND request_id=?', fid, requestId);
                    if (duplicate)
                        return json(duplicate);
                    if (String(e).includes('UNIQUE'))
                        fail(409, 'Kode pencocokan ini sudah dipakai.');
                    throw e;
                }
                return json({ receipt }, 201);
            }
            if (method === 'GET' && parts[2] === 'media')
                return mediaResponse(parts[3], fid);
            fail(404, 'Halaman tidak ditemukan.');
        }
        const u = await requireUser(request);
        if (u.must_change_password && !['session', 'account', 'logout'].includes(parts[0]))
            fail(403, 'Ganti sandi sementara Anda sebelum melanjutkan.');
        if (!['GET', 'HEAD'].includes(method))
            await rate('write:' + u.id, 180, 60);
        if (parts[0] === 'logout' && method === 'POST') {
            await run('DELETE FROM sessions WHERE hash=?', u.hash);
            await log(u, 'auth.logout', u.id);
            return jsonCookie({ ok: true }, '', 0);
        }
        if (parts[0] === 'reauth' && method === 'POST') {
            const b = await body();
            await rate('reauth:' + u.id, 6);
            if (!await verifyPassword(String(b.password ?? ''), u.password_hash))
                fail(401, 'Sandi tidak sesuai.');
            if (u.totp_cipher)
                await checkTotp(u, String(b.otp ?? ''));
            await run('UPDATE sessions SET reauth_at=? WHERE hash=?', Date.now(), u.hash);
            return json({ ok: true });
        }
        if (parts[0] === 'account' && method === 'POST') {
            const b = await body();
            await rate('account:' + u.id, 6);
            if (!await verifyPassword(String(b.current_password ?? ''), u.password_hash))
                fail(401, 'Sandi saat ini tidak sesuai.');
            const password = assertPassword(b.password);
            if (u.totp_cipher)
                await checkTotp(u, String(b.otp ?? ''));
            await db.batch([stmt('UPDATE members SET password_hash=?,must_change_password=0 WHERE id=?', await hashPassword(password), u.id), stmt('DELETE FROM sessions WHERE member_id=?', u.id), auditStmt(u, 'account.password', u.id)]);
            return loginResponse(u);
        }
        if (parts[0] === 'account' && parts[1] === 'sessions' && method === 'DELETE') {
            await run('DELETE FROM sessions WHERE member_id=?', u.id);
            await log(u, 'account.revoke_sessions', u.id);
            return jsonCookie({ ok: true }, '', 0);
        }
        if (parts[0] === 'mfa')
            return mfa(request, u, parts, method);
        if (parts[0] === 'trainings') {
            if (parts.length === 1 && method === 'GET') {
                const rows = await all(`SELECT t.*,(SELECT COUNT(*) FROM forms f WHERE f.training_id=t.id) AS form_count,(SELECT COUNT(*) FROM responses r JOIN forms f ON f.id=r.form_id WHERE f.training_id=t.id AND r.expires_at>?) AS response_count FROM trainings t WHERE ?='admin' OR t.created_by=? OR EXISTS (SELECT 1 FROM training_members tm WHERE tm.training_id=t.id AND tm.member_id=?) ORDER BY t.start_date DESC,t.created_at DESC`, now(), u.role, u.id, u.id);
                return json({ trainings: rows.map((t: any) => ({ ...t, details: JSON.parse(t.details_json), details_json: undefined, banner: !!t.banner })) });
            }
            if (parts.length === 1 && method === 'POST') {
                requireEditor(u);
                const b = validateTraining(await body());
                const tid = id(), time = now();
                await db.batch([stmt('INSERT INTO trainings (id,name,program,status,start_date,end_date,location,facilitator,details_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', tid, b.name, b.program, b.status, b.start_date, b.end_date, b.location, b.facilitator, JSON.stringify(b.details), u.id, time, time), auditStmt(u, 'training.create', tid)]);
                return json({ id: tid }, 201);
            }
            const tid = parts[1], t = await trainingAccess(u, tid);
            if (parts.length === 2 && method === 'GET') {
                const fs = await all('SELECT f.*,(SELECT COUNT(*) FROM responses r WHERE r.form_id=f.id AND r.expires_at>?) AS response_count FROM forms f WHERE f.training_id=? ORDER BY f.created_at', now(), tid);
                return json({ training: { ...t, banner: !!t.banner, details: JSON.parse(t.details_json), details_json: undefined }, forms: await Promise.all(fs.map((f: any) => formData(f, false, u.role === 'analyst'))), member_ids: (await all('SELECT member_id FROM training_members WHERE training_id=?', tid)).map((r: any) => r.member_id) });
            }
            if (parts[2] === 'report' && method === 'GET')
                return json(await report(u, tid, url.searchParams.get('pre'), url.searchParams.get('post')));
            if (parts[2] === 'banner') {
                const media = t.banner ? JSON.parse(t.banner) as { key: string; mime: string; size: number } : null;
                if (method === 'GET') {
                    if (!media?.key)
                        fail(404, 'Gambar tidak ditemukan.');
                    const file = await env.BUCKET.get(media.key);
                    if (!file)
                        fail(404, 'Gambar tidak tersedia.');
                    return new Response(file.body, { headers: { 'Content-Type': media.mime, 'Content-Length': String(media.size), 'Content-Security-Policy': "default-src 'none'; sandbox" } });
                }
                if (method === 'PUT') {
                    requireEditor(u);
                    if (Number(request.headers.get('content-length') ?? 0) > 20 * 1024 * 1024)
                        fail(413, 'Ukuran gambar maksimal 20 MB.');
                    const b = await (await boundedMediaRequest(request)).formData();
                    const file = b.get('file');
                    if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024)
                        fail(400, 'Pilih file gambar maksimal 20 MB.');
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    const mime = detectMedia(bytes);
                    if (!mime || !mime.startsWith('image/'))
                        fail(415, 'Gunakan foto PNG, JPG, WebP, atau GIF.');
                    const mid = id(), key = 'banners/' + tid + '/' + mid;
                    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
                    try {
                        await run('UPDATE trainings SET banner=?,updated_at=? WHERE id=?', JSON.stringify({ key, mime, size: file.size }), now(), tid);
                    }
                    catch (e) {
                        await env.BUCKET.delete(key);
                        throw e;
                    }
                    if (media?.key)
                        await env.BUCKET.delete(media.key);
                    await log(u, 'training.banner', tid);
                    return json({ ok: true });
                }
                if (method === 'DELETE') {
                    requireEditor(u);
                    requireRecent(u);
                    if (media?.key)
                        await env.BUCKET.delete(media.key);
                    await run('UPDATE trainings SET banner=NULL,updated_at=? WHERE id=?', now(), tid);
                    await log(u, 'training.banner.remove', tid);
                    return json({ ok: true });
                }
            }
            if (parts[2] === 'members' && method === 'PUT') {
                requireAdmin(u);
                requireRecent(u);
                const b = await body();
                const ids = z.array(z.string().uuid()).max(100).parse(b.member_ids);
                for (const mid of ids)
                    if (!await one('SELECT 1 FROM members WHERE id=? AND active=1', mid))
                        fail(400, 'Anggota tidak tersedia.');
                await db.batch([stmt('DELETE FROM training_members WHERE training_id=?', tid), ...ids.map(mid => stmt('INSERT INTO training_members (training_id,member_id) VALUES (?,?)', tid, mid)), auditStmt(u, 'training.members', tid)]);
                return json({ ok: true });
            }
            if (parts[2] === 'forms' && method === 'POST') {
                requireEditor(u);
                const b = await body();
                let source: any;
                if (b.template_id) {
                    source = await one('SELECT * FROM templates WHERE id=?', b.template_id);
                    if (!source)
                        fail(404, 'Template tidak ditemukan.');
                    if (source.questions_json)
                        source = { ...source, questions: JSON.parse(source.questions_json) };
                }
                return json(await newForm(u, tid, b, source), 201);
            }
            if (parts.length === 2 && method === 'PUT') {
                requireEditor(u);
                const b = validateTraining(await body());
                const r = await run('UPDATE trainings SET name=?,program=?,status=?,start_date=?,end_date=?,location=?,facilitator=?,details_json=?,version=version+1,updated_at=? WHERE id=? AND version=?', b.name, b.program, b.status, b.start_date, b.end_date, b.location, b.facilitator, JSON.stringify(b.details), now(), tid, b.version);
                if (!r.meta.changes)
                    fail(409, 'Kegiatan diubah anggota lain. Muat ulang.');
                await log(u, 'training.update', tid);
                return json({ ok: true });
            }
            if (parts.length === 2 && method === 'DELETE') {
                requireAdmin(u);
                requireRecent(u);
                const mediaRows = await all('SELECT m.key FROM media m JOIN forms f ON f.id=m.form_id WHERE f.training_id=?', tid);
                for (const r of mediaRows)
                    await env.BUCKET.delete(r.key);
                if (t.banner)
                    await env.BUCKET.delete((JSON.parse(t.banner) as { key: string }).key);
                await db.batch([stmt('DELETE FROM trainings WHERE id=?', tid), auditStmt(u, 'training.delete', tid)]);
                return json({ ok: true });
            }
        }
        if (parts[0] === 'forms') {
            if (parts.length === 1 && method === 'GET') {
                const rows = await all(`SELECT f.*,t.name AS training_name,(SELECT COUNT(*) FROM responses r WHERE r.form_id=f.id AND r.expires_at>?) AS response_count FROM forms f JOIN trainings t ON t.id=f.training_id WHERE ?='admin' OR t.created_by=? OR EXISTS (SELECT 1 FROM training_members tm WHERE tm.training_id=t.id AND tm.member_id=?) ORDER BY f.updated_at DESC`, now(), u.role, u.id, u.id);
                return json({ forms: await Promise.all(rows.map((f: any) => formData(f, false, u.role === 'analyst'))) });
            }
            const fid = parts[1], f = await formAccess(u, fid);
            if (parts.length === 2 && method === 'GET') {
                const data = await formData(f, u.role !== 'analyst');
                if (u.role === 'analyst')
                    data.questions = publicQuestions(data.questions);
                return json({ form: data });
            }
            if (parts.length === 2 && method === 'PUT') {
                requireEditor(u);
                const b = await body();
                let qs: Question[];
                try {
                    qs = cleanQuestions(b.questions);
                }
                catch (e) {
                    fail(400, e instanceof Error ? e.message : 'Pertanyaan tidak valid.');
                }
                const pair = b.pair_question_id || null;
                if (pair && !qs!.some(q => q.id === pair && q.required && ['short_text', 'number'].includes(q.type)))
                    fail(400, 'Pertanyaan pencocokan wajib: teks singkat atau angka.');
                for (const q of qs!) {
                    if (q.mediaId && !await one('SELECT 1 FROM media WHERE id=? AND form_id=?', q.mediaId, fid))
                        fail(400, 'Media tidak tersedia dalam formulir ini.');
                }
                const structural = JSON.stringify(qs!) !== f.questions_json || pair !== f.pair_question_id;
                if (f.locked_at && structural)
                    fail(409, 'Formulir terkunci. Buat salinan untuk versi baru.');
                const title = z.string().trim().min(1).max(200).parse(b.title);
                const description = z.string().max(4000).parse(b.description ?? '');
                const expiry = b.expires_at ? z.string().datetime().parse(b.expires_at) : null;
                const result = await run('UPDATE forms SET title=?,description=?,questions_json=?,pair_question_id=?,expires_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (?=0 OR locked_at IS NULL)', title, description, JSON.stringify(qs!), pair, expiry, now(), fid, b.revision, structural ? 1 : 0);
                if (!result.meta.changes)
                    fail(409, 'Formulir berubah atau menerima respons. Muat ulang.');
                await log(u, 'form.update', fid);
                return json({ ok: true });
            }
            if (parts[2] === 'duplicate' && method === 'POST') {
                requireEditor(u);
                return json(await newForm(u, f.training_id, { title: f.title + ' (salinan)', type: f.type }, { ...f, questions: JSON.parse(f.questions_json).map((q: Question) => ({ ...q, mediaId: undefined })) }), 201);
            }
            if (parts[2] === 'status' && method === 'POST') {
                requireEditor(u);
                const b = await body();
                const status = z.enum(['draft', 'published', 'closed']).parse(b.status);
                if (status === 'published') {
                    const qs = cleanQuestions(JSON.parse(f.questions_json));
                    if (!qs.some(q => !['section', 'pagebreak'].includes(q.type)))
                        fail(400, 'Tambahkan setidaknya satu pertanyaan.');
                    if (f.expires_at && f.expires_at <= now())
                        fail(400, 'Perbarui batas waktu sebelum membuka formulir.');
                }
                await run('UPDATE forms SET status=?,updated_at=? WHERE id=?', status, now(), fid);
                await log(u, 'form.' + status, fid);
                return json({ ok: true });
            }
            if (parts[2] === 'rotate-link' && method === 'POST') {
                requireEditor(u);
                const token = randomToken();
                await db.batch([stmt('UPDATE forms SET share_hash=?,share_cipher=?,updated_at=? WHERE id=?', await sha256(token), await encrypt(env.DATA_KEY, token, 'share:' + fid), now(), fid), auditStmt(u, 'form.rotate_link', fid)]);
                return json({ share_code: token });
            }
            if (parts[2] === 'template' && method === 'POST') {
                requireEditor(u);
                const b = await body();
                const title = z.string().trim().min(1).max(200).parse(b.title);
                const tid = id();
                const qs = JSON.parse(f.questions_json).map((q: Question) => ({ ...q, mediaId: undefined }));
                await db.batch([stmt('INSERT INTO templates (id,title,type,description,questions_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)', tid, title, f.type, f.description, JSON.stringify(qs), u.id, now()), auditStmt(u, 'template.create', tid)]);
                return json({ id: tid }, 201);
            }
            if (parts[2] === 'responses') {
                if (u.role === 'analyst')
                    fail(403, 'Analis hanya untuk laporan agregat.');
                if (method === 'GET') {
                    const rows = await rawResponses(f);
                    await log(u, 'responses.read', fid);
                    return json({ responses: rows, questions: JSON.parse(f.questions_json), limit: 5000 });
                }
                const rid = parts[3];
                const response = await one('SELECT * FROM responses WHERE id=? AND form_id=?', rid, fid);
                if (!response)
                    fail(404, 'Respons tidak ditemukan.');
                requireEditor(u);
                if (method === 'DELETE') {
                    requireAdmin(u);
                    requireRecent(u);
                    await db.batch([stmt('DELETE FROM responses WHERE id=? AND form_id=?', rid, fid), auditStmt(u, 'response.delete', rid)]);
                    return json({ ok: true });
                }
                if (method === 'PUT') {
                    const b = await body();
                    const reason = z.string().trim().min(5).max(500).parse(b.reason);
                    await db.batch([stmt('UPDATE responses SET excluded=?,exclusion_reason=? WHERE id=? AND form_id=?', b.excluded ? 1 : 0, reason, rid, fid), auditStmt(u, b.excluded ? 'response.exclude' : 'response.restore', rid, 'Keputusan kualitas data disimpan')]);
                    return json({ ok: true });
                }
            }
            if (parts[2] === 'export' && method === 'POST') {
                if (u.role === 'analyst')
                    fail(403, 'Ekspor respons dibatasi untuk petugas kegiatan.');
                requireRecent(u);
                const rows = await rawResponses(f);
                const qs: Question[] = JSON.parse(f.questions_json).filter((q: Question) => !['section', 'pagebreak'].includes(q.type));
                await log(u, 'responses.export', fid);
                return new Response(csv([['ID Respons', 'Waktu Kirim', 'Skor', 'Skor Maksimal', 'Dikecualikan', ...qs.map(q => q.label)], ...rows.map((r: any) => [r.id, r.submitted_at, r.score, r.max_score, r.excluded, ...qs.map(q => Array.isArray(r.answers[q.id]) ? r.answers[q.id].join('; ') : r.answers[q.id])])]), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="respons-hrp-insight.csv"' } });
            }
            if (parts[2] === 'media' && method === 'POST') {
                requireEditor(u);
                if (f.locked_at)
                    fail(409, 'Formulir terkunci. Duplikat untuk mengganti media.');
                const size = Number(request.headers.get('content-length') ?? 0);
                if (size > 20 * 1024 * 1024)
                    fail(413, 'Ukuran media maksimal 20 MB.');
                const limited = await boundedMediaRequest(request);
                const data = await limited.formData();
                const file = data.get('file');
                if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024)
                    fail(400, 'Pilih file foto atau video maksimal 20 MB.');
                const bytes = new Uint8Array(await file.arrayBuffer());
                const mime = detectMedia(bytes);
                if (!mime)
                    fail(415, 'Gunakan foto PNG, JPG, WebP, atau video MP4/WebM.');
                const mid = id(), key = 'media/' + fid + '/' + mid;
                await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
                try {
                    await run('INSERT INTO media (id,form_id,key,mime,size,created_at) VALUES (?,?,?,?,?,?)', mid, fid, key, mime, file.size, now());
                }
                catch (e) {
                    await env.BUCKET.delete(key);
                    throw e;
                }
                await log(u, 'media.upload', mid);
                return json({ id: mid, mime }, 201);
            }
            if (parts[2] === 'media' && method === 'GET')
                return mediaResponse(parts[3], fid);
            if (parts.length === 2 && method === 'DELETE') {
                requireAdmin(u);
                requireRecent(u);
                for (const r of await all('SELECT key FROM media WHERE form_id=?', fid))
                    await env.BUCKET.delete(r.key);
                await db.batch([stmt('DELETE FROM forms WHERE id=?', fid), auditStmt(u, 'form.delete', fid)]);
                return json({ ok: true });
            }
        }
        if (parts[0] === 'templates') {
            if (method === 'GET') {
                const custom = await all('SELECT * FROM templates ORDER BY created_at DESC');
                const collection = custom.map((t: any) => ({ ...t, questions: JSON.parse(t.questions_json), questions_json: undefined, builtin: false }));
                return json({ templates: collection.map((t: any) => u.role === 'analyst' ? { ...t, questions: publicQuestions(t.questions) } : t) });
            }
            if (method === 'POST' && parts.length === 1) {
                requireEditor(u);
                const b = await body();
                const title = z.string().trim().min(1).max(200).parse(b.title);
                const type = z.enum(FORM_TYPES.map(x => x[0]) as [
                    string,
                    ...string[]
                ]).parse(b.type);
                const description = z.string().max(500).parse(b.description ?? '');
                const questions = cleanQuestions(b.questions ?? []).map((q: Question) => ({ ...q, mediaId: undefined }));
                const tid = id();
                await db.batch([stmt('INSERT INTO templates (id,title,type,description,questions_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)', tid, title, type, description, JSON.stringify(questions), u.id, now()), auditStmt(u, 'template.create', tid)]);
                return json({ id: tid }, 201);
            }
            if (parts.length === 2 && parts[1] && method === 'PUT') {
                requireEditor(u);
                const t = await one('SELECT * FROM templates WHERE id=?', parts[1]);
                if (!t)
                    fail(404, 'Template tidak ditemukan.');
                const b = await body();
                const title = z.string().trim().min(1).max(200).parse(b.title);
                const type = z.enum(FORM_TYPES.map(x => x[0]) as [
                    string,
                    ...string[]
                ]).parse(b.type);
                const description = z.string().max(500).parse(b.description ?? '');
                const questions = cleanQuestions(b.questions ?? []);
                await db.batch([stmt('UPDATE templates SET title=?,type=?,description=?,questions_json=?,version=version+1 WHERE id=?', title, type, description, JSON.stringify(questions), parts[1]), auditStmt(u, 'template.update', parts[1])]);
                return json({ ok: true });
            }
            if (method === 'DELETE') {
                requireEditor(u);
                await db.batch([stmt('DELETE FROM templates WHERE id=?', parts[1]), auditStmt(u, 'template.delete', parts[1])]);
                return json({ ok: true });
            }
        }
        if (parts[0] === 'members') {
            requireAdmin(u);
            if (method === 'GET')
                return json({ members: (await all('SELECT * FROM members ORDER BY created_at')).map(safeMember) });
            requireRecent(u);
            const b = await body();
            if (method === 'POST') {
                const c = credentials.parse(b);
                assertPassword(c.password, c.username);
                const name = z.string().trim().min(1).max(100).parse(b.name);
                const role = z.enum(['admin', 'staff', 'analyst']).parse(b.role);
                const mid = id();
                if (await one('SELECT 1 FROM members WHERE username=?', c.username))
                    fail(409, 'Username sudah digunakan.');
                await db.batch([stmt('INSERT INTO members (id,username,password_hash,name,role,must_change_password,created_at) VALUES (?,?,?,?,?,1,?)', mid, c.username, await hashPassword(c.password), name, role, now()), auditStmt(u, 'member.create', mid)]);
                return json({ id: mid }, 201);
            }
            const mid = parts[1];
            const target = await one('SELECT * FROM members WHERE id=?', mid);
            if (!target)
                fail(404, 'Akun tidak ditemukan.');
            const ws = await one('SELECT * FROM workspace WHERE id=?', 'hrp-insight');
            if (mid === ws.owner_id)
                fail(403, 'Akun pemilik tidak dapat diubah atau dinonaktifkan.');
            if (parts[2] === 'password' && method === 'PUT') {
                assertPassword(b.password);
                await db.batch([stmt('UPDATE members SET password_hash=?,must_change_password=1 WHERE id=?', await hashPassword(b.password), mid), stmt('DELETE FROM sessions WHERE member_id=?', mid), auditStmt(u, 'member.reset_password', mid)]);
                return json({ ok: true });
            }
            if (method === 'PUT') {
                const role = z.enum(['admin', 'staff', 'analyst']).parse(b.role);
                const active = z.boolean().parse(b.active);
                await db.batch([stmt('UPDATE members SET role=?,active=? WHERE id=?', role, active ? 1 : 0, mid), stmt('DELETE FROM sessions WHERE member_id=?', mid), auditStmt(u, 'member.update', mid)]);
                return json({ ok: true });
            }
        }
        if (parts[0] === 'audit' && method === 'GET') {
            requireAdmin(u);
            return json({ events: await all('SELECT * FROM audit ORDER BY created_at DESC LIMIT 200') });
        }
        if (parts[0] === 'help') {
            const helpCategories = ['bug', 'saran'] as const;
            const helpStatuses = ['baru', 'diproses', 'selesai', 'ditolak'] as const;
            const helpLabel = (c: string) => c === 'bug' ? 'Laporan error/bug' : 'Saran pengembangan';
            if (parts[1] === 'media' && method === 'GET') {
                const m = await one('SELECT * FROM help WHERE id=?', parts[2]);
                const media = m?.media_json ? JSON.parse(m.media_json) as { key: string; mime: string; size: number }[] : [];
                const index = Number(parts[3] ?? 0);
                const item = Number.isInteger(index) && index >= 0 && index < media.length ? media[index] : undefined;
                if (!item || !item.key)
                    fail(404, 'Gambar tidak ditemukan.');
                if (u.role !== 'admin' && m.author_id !== u.id)
                    fail(403, 'Anda tidak bisa mengakses gambar ini.');
                const file = await env.BUCKET.get(item.key);
                if (!file)
                    fail(404, 'Gambar tidak tersedia.');
                return new Response(file.body, { headers: { 'Content-Type': item.mime, 'Content-Length': String(item.size), 'Content-Security-Policy': "default-src 'none'; sandbox" } });
            }
            if (parts[1] === 'messages') {
                if (method === 'GET') {
                    requireAdmin(u);
                    const rows = await all('SELECT * FROM help ORDER BY created_at DESC LIMIT 200');
                    return json({ reports: rows.map((r: any) => ({ ...r, media_count: r.media_json ? (JSON.parse(r.media_json) as { key: string }[]).length : 0 })) });
                }
                const mid = parts[2];
                const target = await one('SELECT * FROM help WHERE id=?', mid);
                if (!target)
                    fail(404, 'Laporan tidak ditemukan.');
                if (method === 'POST' && parts[3] === 'status') {
                    requireAdmin(u);
                    const status = z.enum(helpStatuses).parse((await body()).status);
                    await db.batch([stmt('UPDATE help SET status=?,updated_at=? WHERE id=?', status, now(), mid), auditStmt(u, 'help.status', mid, status)]);
                    return json({ ok: true });
                }
                if (method === 'DELETE') {
                    requireAdmin(u);
                    requireRecent(u);
                    const media = target.media_json ? JSON.parse(target.media_json) as { key: string }[] : [];
                    for (const item of media)
                        await env.BUCKET.delete(item.key);
                    await db.batch([stmt('DELETE FROM help WHERE id=?', mid), auditStmt(u, 'help.delete', mid, helpLabel(target.category))]);
                    return json({ ok: true });
                }
            }
            if (parts.length === 1 && method === 'GET') {
                const time = Math.floor(Date.now() / 1000), bucket = Math.floor(time / 86400);
                const k = await keyedHash(env.DATA_KEY, 'rate:help:' + u.id + ':' + bucket);
                const row = await one('SELECT count FROM rate_limits WHERE key=?', k);
                const rows = await all('SELECT * FROM help WHERE author_id=? ORDER BY created_at DESC LIMIT 50', u.id);
                return json({ reports: rows.map((r: any) => ({ id: r.id, category: r.category, message: r.message, media_count: r.media_json ? (JSON.parse(r.media_json) as { key: string }[]).length : 0, status: r.status, created_at: r.created_at, updated_at: r.updated_at })), remaining_today: Math.max(0, 10 - (row?.count ?? 0)) });
            }
            if (parts.length === 1 && method === 'POST') {
                await rate('help:' + u.id, 10, 86400);
                const b = await (await boundedMediaRequest(request, 105 * 1024 * 1024)).formData();
                const category = z.enum(helpCategories).parse(b.get('category'));
                const message = z.string().trim().min(20, 'Uraian minimal 20 karakter.').max(2000, 'Uraian maksimal 2.000 karakter.').parse(b.get('message'));
                const picked = b.getAll('file').filter(x => x instanceof File && x.size > 0) as File[];
                if (picked.length > 5)
                    fail(400, 'Maksimal 5 foto per kiriman.');
                const rid = id(), time = now();
                const media: { key: string; mime: string; size: number }[] = [];
                try {
                    for (const file of picked) {
                        if (file.size > 20 * 1024 * 1024)
                            fail(413, 'Ukuran gambar maksimal 20 MB.');
                        const bytes = new Uint8Array(await file.arrayBuffer());
                        const mime = detectMedia(bytes);
                        if (!mime || mime.startsWith('video/'))
                            fail(415, 'Gunakan foto PNG, JPG, atau WebP.');
                        const key = 'help/' + rid + '/' + crypto.randomUUID();
                        await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
                        media.push({ key, mime, size: file.size });
                    }
                    await db.batch([stmt('INSERT INTO help (id,author_id,author_name,category,message,media_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', rid, u.id, u.name, category, message, media.length ? JSON.stringify(media) : null, 'baru', time, time), auditStmt(u, 'help.create', rid, helpLabel(category))]);
                }
                catch (e) {
                    for (const item of media)
                        await env.BUCKET.delete(item.key);
                    throw e;
                }
                await notifyTelegram(category, u.name, message);
                return json({ id: rid }, 201);
            }
        }
        if (parts[0] === 'settings') {
            requireAdmin(u);
            if (method === 'GET') {
                const ws = await one('SELECT * FROM workspace WHERE id=?', 'hrp-insight');
                const expired = await one('SELECT COUNT(*) AS count FROM responses WHERE expires_at<=?', now());
                return json({ settings: ws, expired_count: expired.count });
            }
            requireRecent(u);
            if (method === 'PUT') {
                const b = z.object({ name: z.string().trim().min(1).max(200), retention_days: z.number().int().min(30).max(3650), privacy_contact: z.string().max(200), privacy_notice: z.string().trim().min(30).max(3000), landing_request_url: z.string().max(400).default(''), landing_feedback_url: z.string().max(400).default('') }).parse(await body());
                await db.batch([stmt('UPDATE workspace SET name=?,retention_days=?,privacy_contact=?,privacy_notice=?,landing_request_url=?,landing_feedback_url=? WHERE id=?', b.name, b.retention_days, b.privacy_contact, b.privacy_notice, b.landing_request_url, b.landing_feedback_url, 'hrp-insight'), auditStmt(u, 'privacy.update', 'hrp-insight')]);
                return json({ ok: true });
            }
            if (parts[1] === 'purge' && method === 'POST') {
                const r = await run('DELETE FROM responses WHERE expires_at<=?', now());
                await run('DELETE FROM sessions WHERE expires_at<=?', Date.now());
                await run('DELETE FROM rate_limits WHERE expires_at<=?', Math.floor(Date.now() / 1000));
                await log(u, 'privacy.purge', 'hrp-insight', String(r.meta.changes) + ' respons kedaluwarsa dihapus');
                return json({ deleted: r.meta.changes });
            }
        }
        fail(404, 'Halaman tidak ditemukan.');
    }
    function validateTraining(raw: unknown) { const b = trainingInput.parse(raw); for (const key of ['duration', 'price', 'participant_count']) {
        const v = b.details[key];
        if (v !== undefined && v !== '') {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0 || n > 1e12 || (key !== 'price' && !Number.isInteger(n)))
                fail(400, 'Durasi dan jumlah peserta harus berupa bilangan bulat positif.');
            b.details[key] = n;
        }
    } for (const key of ['start_date', 'end_date'] as const)
        if (b[key] && !/^\d{4}-\d{2}-\d{2}$/.test(b[key]))
            fail(400, 'Tanggal tidak valid.'); if (b.start_date && b.end_date && b.end_date < b.start_date)
        fail(400, 'Tanggal selesai tidak boleh mendahului tanggal mulai.'); for (const [k, v] of Object.entries(b.details))
        if (k.endsWith('_link') || k.endsWith('_url')) {
            if (v) {
                try {
                    const url = new URL(String(v));
                    if (!['https:', 'http:'].includes(url.protocol))
                        throw new Error();
                }
                catch {
                    fail(400, 'Tautan harus menggunakan https:// atau http://.');
                }
            }
        } return b; }
    function jsonCookie(data: unknown, token: string, maxAge = 28800) { const response = json(data); response.headers.set('Set-Cookie', `__Host-hrp-insight_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`); return response; }
    async function loginResponse(u: any) { const token = randomToken(), time = Date.now(); await run('INSERT INTO sessions (hash,member_id,created_at,expires_at,last_seen,reauth_at) VALUES (?,?,?,?,?,?)', await sha256(token), u.id, time, time + 8 * 3600000, time, time); await run('DELETE FROM sessions WHERE member_id=? AND hash NOT IN (SELECT hash FROM sessions WHERE member_id=? ORDER BY created_at DESC LIMIT 10)', u.id, u.id); return jsonCookie({ ok: true }, token); }
    async function mediaResponse(mid: string, fid: string) { const m = await one('SELECT * FROM media WHERE id=? AND form_id=?', mid, fid); if (!m)
        fail(404, 'Media tidak ditemukan.'); const file = await env.BUCKET.get(m.key); if (!file)
        fail(404, 'Media tidak tersedia.'); return new Response(file.body, { headers: { 'Content-Type': m.mime, 'Content-Length': String(m.size), 'Content-Security-Policy': "default-src 'none'; sandbox" } }); }
    async function checkTotp(u: any, otp: string) { const { totpCounter } = await import('./totp'); const secret = await decrypt<string>(env.DATA_KEY, u.totp_cipher, 'totp:' + u.id); const counter = await totpCounter(secret, otp); if (counter === null || counter <= u.totp_last_counter)
        fail(401, 'Kode autentikator tidak valid atau sudah digunakan.'); const r = await run('UPDATE members SET totp_last_counter=? WHERE id=? AND totp_last_counter<?', counter, u.id, counter); if (!r.meta.changes)
        fail(401, 'Kode autentikator sudah digunakan.'); }
    async function mfa(request: Request, u: any, parts: string[], method: string) { requireRecent(u); const { generateTotpSecret, totpCounter } = await import('./totp'); if (parts[1] === 'begin' && method === 'POST') {
        if (u.totp_cipher)
            fail(409, 'Autentikator sudah aktif.');
        const secret = generateTotpSecret();
        return json({ secret });
    } if (parts[1] === 'enable' && method === 'POST') {
        if (u.totp_cipher)
            fail(409, 'Autentikator sudah aktif.');
        const b = await readJson(request);
        const secret = z.string().regex(/^[A-Z2-7]{32}$/).parse(b.secret);
        const c = await totpCounter(secret, String(b.otp));
        if (c === null)
            fail(400, 'Kode autentikator tidak sesuai.');
        await db.batch([stmt('UPDATE members SET totp_cipher=?,totp_last_counter=? WHERE id=?', await encrypt(env.DATA_KEY, secret, 'totp:' + u.id), c, u.id), stmt('DELETE FROM sessions WHERE member_id=? AND hash<>?', u.id, u.hash), auditStmt(u, 'mfa.enable', u.id)]);
        return json({ ok: true });
    } if (parts[1] === 'disable' && method === 'POST') {
        const b = await readJson(request);
        if (!u.totp_cipher)
            fail(400, 'Autentikator belum aktif.');
        await checkTotp(u, String(b.otp));
        await db.batch([stmt('UPDATE members SET totp_cipher=NULL,totp_last_counter=0 WHERE id=?', u.id), stmt('DELETE FROM sessions WHERE member_id=? AND hash<>?', u.id, u.hash), auditStmt(u, 'mfa.disable', u.id)]);
        return json({ ok: true });
    } fail(404, 'Halaman tidak ditemukan.'); }
    return async (request: Request) => { try {
        return secureResponse(await handle(request));
    }
    catch (error) {
        if (error instanceof HttpError)
            return secureResponse(json({ error: error.message }, error.status));
        if (error instanceof z.ZodError)
            return secureResponse(json({ error: error.issues[0]?.message ?? 'Data tidak valid.' }, 400));
        console.error('HRP Insight request failed', { type: error instanceof Error ? error.name : 'Unknown' });
        return secureResponse(json({ error: 'Permintaan belum berhasil. Coba lagi.' }, 503));
    } };
}
async function boundedMediaRequest(request: Request, max?: number) { const reader = request.body?.getReader(); if (!reader)
    fail(400, 'File belum dipilih.'); let length = 0; const chunks: Uint8Array[] = []; const limit = max ?? 21 * 1024 * 1024; while (true) {
    const r = await reader.read();
    if (r.done)
        break;
    length += r.value.length;
    if (length > limit) {
        await reader.cancel();
        fail(413, 'Ukuran unggahan terlalu besar.');
    }
    chunks.push(r.value);
} const bytes = new Uint8Array(length); let offset = 0; for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
} return new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body: bytes }); }
export function detectMedia(bytes: Uint8Array) { if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png'; if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'; const s = new TextDecoder().decode(bytes.slice(0, 16)); if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP')
    return 'image/webp'; if (s.slice(4, 8) === 'ftyp')
    return 'video/mp4'; if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'video/webm'; return null; }
