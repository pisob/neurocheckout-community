import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { matchesUpdateHealth, updateFailureCode } from './update-health.mjs';
import { activateCandidate } from './update-switch.mjs';
import { createUpdateBackup, restoreUpdateBackup, verifyUpdateBackup } from './update-backup.mjs';
import { LocalDataStore, initializeLocalData } from './local-data-store.mjs';
import { recordSourceDiagnostic, readSourceDiagnostic, sourceFailureCode } from './source-diagnostic.mjs';
import { synchronizationDiagnostic } from '../lib/sync-diagnostic.ts';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'nc-hardening-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test('health requires expected release, service and explicit success', () => {
  const body = { ok:true, service:'neurocheckout-community', version:'0.1.0-preview.30' };
  assert.equal(matchesUpdateHealth(body, body.version), true);
  for (const value of [null, {}, {...body, ok:false}, {...body, version:'0.1.0-preview.29'}, {...body, service:'other'}]) assert.equal(matchesUpdateHealth(value, body.version), false);
  assert.equal(updateFailureCode(new Error('SECRET customer@example.invalid')), 'update_failed');
});
test('failed candidate returns a live old HTTP service and preserves vault/config; snapshot is restorable', async t => {
  const root=fixture(t), stateDirectory=resolve(root,'state');
  mkdirSync(stateDirectory,{mode:0o700}); initializeLocalData(stateDirectory,'fixture-shop');
  const store=new LocalDataStore(stateDirectory);
  store.put({kind:'cart',sourceId:'fixture',revision:1,operation:'upsert',observedAt:new Date().toISOString(),payload:{total:77}}); store.close();
  writeFileSync(resolve(root,'.env.local'),'SYNTHETIC_CONFIG=preserved',{mode:0o600});
  let server, origin, selected='old';
  const stop=async()=>{if(server) {await new Promise(done=>server.close(done)); server=undefined;}};
  t.after(stop);
  const start=async source=>{
    selected=source;
    server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,service:'neurocheckout-community',version:source==='new'?'wrong-version':'old'}));});
    await new Promise(done=>server.listen(0,'127.0.0.1',done)); origin=`http://127.0.0.1:${server.address().port}`;
  };
  await start('old');
  const result=await activateCandidate('new','old',{stop,start,
    backup:async()=>createUpdateBackup({root,stateDirectory,destination:resolve(root,'backup')}),
    healthy:async()=>matchesUpdateHealth(await (await fetch(origin)).json(),selected),
    commit:async()=>assert.fail('unhealthy candidate must never commit'),
  });
  assert.equal(result.phase,'rolled_back'); assert.equal(result.errorCode,'candidate_unhealthy');
  assert.equal((await fetch(origin)).status,200);
  const restored=restoreUpdateBackup(resolve(root,'backup'),resolve(root,'restored'));
  for(const directory of [stateDirectory,resolve(restored,'state')]) {
    const check=new LocalDataStore(directory);
    assert.equal(check.read({kind:'cart',reference:check.reference('cart','fixture'),minimumRevision:1}).payload.total,77); check.close();
  }
  assert.equal(readFileSync(resolve(restored,'config','.env.local'),'utf8'),'SYNTHETIC_CONFIG=preserved');
  chmodSync(resolve(root,'backup','manifest.json'),0o644);
  assert.throws(()=>verifyUpdateBackup(resolve(root,'backup')),/private/);
  assert.throws(()=>restoreUpdateBackup(resolve(root,'backup'),resolve(root,'refused')),/private/);
  assert.equal(existsSync(resolve(root,'refused')),false);
});
test('diagnostics keep only an allowlisted code and timestamp per vault', t => {
  const root=fixture(t); initializeLocalData(root,'fixture'); const store=new LocalDataStore(root);t.after(()=>store.close());
  assert.equal(readSourceDiagnostic(store),null);
  recordSourceDiagnostic(store,'private-secret@example.invalid',1000);
  assert.deepEqual(readSourceDiagnostic(store),{code:'source_unavailable',checked_at:1000});
  assert.equal(sourceFailureCode(new Error('source_auth_rejected')),'source_auth_rejected');
  recordSourceDiagnostic(store,'ok',2000);
  assert.equal(readSourceDiagnostic(store).code,'ok');
});
test('offline, refused, stale and incomplete signals are distinct; stale never claims cron failure', () => {
  const base={online:true,available:true,configured:true,ready:true,now:200000,source:{code:'ok',checked_at:199999}};
  for(const [changes,code] of [
    [{},'source_verified'],[{online:false},'community_offline'],[{available:false},'local_status_unavailable'],
    [{configured:false},'connector_not_configured'],[{source:null},'source_status_stale'],
    [{source:{code:'ok',checked_at:1}},'source_status_stale'],[{ready:false},'source_catching_up'],
    [{source:{code:'source_auth_rejected',checked_at:199999}},'source_auth_rejected'],
    [{source:{code:'source_signature_rejected',checked_at:199999}},'source_signature_rejected'],
  ]) {
    const result=synchronizationDiagnostic({...base,...changes}); assert.equal(result.code,code);
    assert.ok(result.en && result.fr && result.actionEn && result.actionFr);
  }
  assert.match(synchronizationDiagnostic({...base,source:null}).en,/unknown/);
});
