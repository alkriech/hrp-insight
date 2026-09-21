import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, scryptSync, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';

export async function migrateLocal(db, root) {
  await db.prepare('CREATE TABLE IF NOT EXISTS hrp_insight_local_migrations (name TEXT PRIMARY KEY, digest TEXT NOT NULL)').run();
  for (const legacyName of ['hafecs_local_migrations', 'hrportal_local_migrations']) {
    const legacy = await db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').bind('table', legacyName).first();
    if (legacy) {
      await db.prepare('INSERT INTO hrp_insight_local_migrations (name,digest) SELECT name,digest FROM ' + legacyName).run();
      await db.prepare('DROP TABLE ' + legacyName).run();
    }
  }
  const journal = JSON.parse(await readFile(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  for (const entry of journal.entries) {
    const sql = await readFile(path.join(root, 'drizzle', entry.tag + '.sql'), 'utf8');
    const digest = createHash('sha256').update(sql).digest('hex');
    const old = await db.prepare('SELECT digest FROM hrp_insight_local_migrations WHERE name=?').bind(entry.tag).first();
    if (old) {
      if (old.digest !== digest) throw new Error('Migrasi lama berubah. Pulihkan file migrasi asli sebelum melanjutkan.');
      continue;
    }
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await db.batch([...statements.map(s => db.prepare(s)), db.prepare('INSERT INTO hrp_insight_local_migrations VALUES (?,?)').bind(entry.tag, digest)]);
  }
  await db.prepare("UPDATE workspace SET id='hrp-insight' WHERE id IN ('hafecs','hrportal')").run();
}

export async function createLocalAdmin(db, name, username) {
  if (!name.trim() || name.trim().length > 100 || !/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Nama wajib diisi; username 3–40 karakter huruf kecil, angka, titik, garis bawah, atau tanda minus.');
  if (await db.prepare('SELECT id FROM workspace LIMIT 1').first()) throw new Error('Workspace sudah ada. Akun yang sudah ada tidak diubah.');
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(32).toString('hex');
  const hash = 'scrypt:16384:8:5:' + salt + ':' + scryptSync(password, salt, 32, {N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex');
  const id = randomUUID(), time = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO members (id,username,password_hash,name,role,must_change_password,created_at) VALUES (?,?,?,?,?,1,?)').bind(id, username, hash, name.trim(), 'admin', time),
    db.prepare('INSERT INTO workspace (id,name,owner_id,created_at) VALUES (?,?,?,?)').bind('hrp-insight','HRP Insight',id,time),
    db.prepare('INSERT INTO audit (id,actor_id,actor_name,action,target_id,created_at) VALUES (?,?,?,?,?,?)').bind(randomUUID(),id,name.trim(),'workspace.setup.local','hrp-insight',time),
  ]);
  return password;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_LOG_PATH = '.wrangler/logs';
  const proxy = await getPlatformProxy({configPath:path.join(root,'wrangler.local.json'),remoteBindings:false});
  try {
    const db = proxy.env.DB;
    await migrateLocal(db, root);
    const varsPath = path.join(root,'.dev.vars');
    let vars;
    try { vars = await readFile(varsPath,'utf8'); } catch (e) { if(e.code !== 'ENOENT') throw e; }
    if (vars === undefined) {
      const existing = await db.prepare('SELECT id FROM members LIMIT 1').first();
      if (existing) throw new Error('Database sudah berisi akun tetapi .dev.vars hilang. Pulihkan .dev.vars dari cadangan; kunci tidak boleh diganti.');
      await writeFile(varsPath, 'APP_ORIGIN=http://localhost:5173\nDATA_KEY=' + randomBytes(32).toString('hex') + '\nSETUP_MODE=disabled\n', {flag:'wx', mode:0o600});
    } else if (!/^DATA_KEY=[a-f0-9]{64}\s*$/m.test(vars) || !/^APP_ORIGIN=http:\/\/localhost:5173\s*$/m.test(vars)) {
      throw new Error('Konfigurasi .dev.vars tidak sesuai. APP_ORIGIN harus http://localhost:5173 dan DATA_KEY harus 64 karakter heksadesimal. Jangan mengganti kunci yang sudah digunakan.');
    }
    if (await db.prepare('SELECT id FROM workspace LIMIT 1').first()) {
      console.log('Database dan akun sudah tersedia. Jalankan npm run dev.');
      return;
    }
    const terminal = createInterface({input:process.stdin,output:process.stdout});
    try {
      const name = await terminal.question('Nama administrator: ');
      const username = (await terminal.question('Username administrator: ')).trim().toLowerCase();
      const password = await createLocalAdmin(db,name,username);
      console.log('\nAdmin lokal berhasil dibuat.\nUsername: ' + username + '\nSandi sementara: ' + password + '\n\nSimpan sandi ini secara privat. Setelah login, wajib ganti sandi.\nJalankan npm run dev lalu buka http://localhost:5173.');
    } finally { terminal.close(); }
  } finally { await proxy.dispose(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('Setup belum berhasil:', e.message); process.exitCode=1; });
}
