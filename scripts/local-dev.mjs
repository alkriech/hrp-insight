import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
try {
  await access('.dev.vars');
  const vars = await readFile('.dev.vars','utf8');
  if (!/^APP_ORIGIN=http:\/\/localhost:5173\s*$/m.test(vars)) throw new Error('origin');
} catch {
  console.error('Jalankan npm run setup:local terlebih dahulu.');
  process.exit(1);
}
console.log('Buka http://localhost:5173. Data tersimpan hanya di laptop ini.');
const child = spawn(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'),'--host','localhost','--port','5173','--strictPort'], {
  cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs',WRANGLER_SEND_METRICS:'false'},
});
child.on('error', e => { console.error(e.message); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
