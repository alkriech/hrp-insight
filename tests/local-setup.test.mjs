import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {buildSync} from 'esbuild';
import {migrateLocal,createLocalAdmin} from '../scripts/local-setup.mjs';
process.env.WRANGLER_SEND_METRICS='false';
process.env.WRANGLER_LOG_PATH='.wrangler/logs';
buildSync({entryPoints:['lib/service.ts'],bundle:true,platform:'node',format:'esm',outdir:'.test-build',logLevel:'silent'});
const {createService}=await import('../.test-build/service.js');
await test('local migrations, admin, real D1 persistence, login and R2',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hrp-insight-local-'));
 const options={configPath:path.resolve('wrangler.local.json'),persist:{path:dir},remoteBindings:false};
 let proxy=await getPlatformProxy(options);
 try {
  await migrateLocal(proxy.env.DB,process.cwd());
  await migrateLocal(proxy.env.DB,process.cwd());
  const password=await createLocalAdmin(proxy.env.DB,'Local Admin','localadmin');
  await assert.rejects(()=>createLocalAdmin(proxy.env.DB,'Another','another'));
  const APP_ORIGIN='http://localhost:5173';
  const service=createService({...proxy.env,DATA_KEY:randomBytes(32).toString('hex'),APP_ORIGIN,SETUP_MODE:'disabled'});
  const session=await service(new Request(APP_ORIGIN+'/api/session'));
  assert.equal(session.status,200);assert.equal((await session.json()).needs_setup,false);
  const login=await service(new Request(APP_ORIGIN+'/api/login',{method:'POST',headers:{Origin:APP_ORIGIN,'X-Hrp-Insight-Request':'1','Content-Type':'application/json'},body:JSON.stringify({username:'localadmin',password})}));
  assert.equal(login.status,200,await login.clone().text());
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const authenticated=await service(new Request(APP_ORIGIN+'/api/session',{headers:{Cookie:cookie}}));
  assert.equal((await authenticated.json()).user.must_change_password,1);
  await proxy.env.BUCKET.put('test','private local upload');
  await proxy.dispose();proxy=await getPlatformProxy(options);
  assert.ok(await proxy.env.DB.prepare('SELECT id FROM workspace').first());
  assert.equal(await (await proxy.env.BUCKET.get('test')).text(),'private local upload');
 } finally {await proxy.dispose();await rm(dir,{recursive:true,force:true});}
});
