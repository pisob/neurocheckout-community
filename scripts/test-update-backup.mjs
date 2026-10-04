import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { initializeLocalData, LocalDataStore } from './local-data-store.mjs';
import { createUpdateBackup, verifyUpdateBackup, restoreUpdateBackup, updatePreflight } from './update-backup.mjs';
import { activateCandidate } from './update-switch.mjs';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'nc-backup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test('multi-store snapshot restores encrypted records and config without overwriting live data', t => {
  const root=fixture(t), stateDirectory=resolve(root,'state');
  mkdirSync(stateDirectory,{mode:0o700});
  for (const name of ['first','second']) {
    const dir=resolve(stateDirectory,'stores',name);
    mkdirSync(dir,{recursive:true,mode:0o700}); initializeLocalData(dir,name);
    const store=new LocalDataStore(dir);
    store.put({kind:'cart',sourceId:'test',revision:1,operation:'upsert',observedAt:new Date().toISOString(),payload:{total:5}});
    store.close();
  }
  writeFileSync(resolve(root,'.env.local'),'SYNTHETIC_SECRET=test',{mode:0o600});
  const backup=createUpdateBackup({root,stateDirectory,destination:resolve(root,'backup')});
  assert.ok(verifyUpdateBackup(backup).files.length>=5);
  const restored=restoreUpdateBackup(backup,resolve(root,'restored'));
  for (const name of ['first','second']) {
    const store=new LocalDataStore(resolve(restored,'state','stores',name));
    assert.equal(store.read({kind:'cart',reference:store.reference('cart','test'),minimumRevision:1}).payload.total,5);
    store.close();
  }
  assert.equal(readFileSync(resolve(restored,'config','.env.local'),'utf8'),'SYNTHETIC_SECRET=test');
  assert.equal(statSync(resolve(restored,'config','.env.local')).mode & 0o077,0);
  assert.throws(()=>restoreUpdateBackup(backup,stateDirectory),/EEXIST/);
});
test('tampered backups and symlink sources are refused', t => {
  const root=fixture(t),stateDirectory=resolve(root,'state');mkdirSync(stateDirectory,{mode:0o700});
  writeFileSync(resolve(root,'.env.local'),'synthetic',{mode:0o600});
  const backup=createUpdateBackup({root,stateDirectory,destination:resolve(root,'backup')});
  writeFileSync(resolve(backup,'config','.env.local'),'changed');
  assert.throws(()=>verifyUpdateBackup(backup),/backup_invalid/);
  symlinkSync(resolve(root,'.env.local'),resolve(stateDirectory,'escape'));
  assert.throws(()=>createUpdateBackup({root,stateDirectory,destination:resolve(root,'unsafe')}),/backup_unsafe_path/);
});
test('preflight refuses insufficient space before shutdown', t => {
  assert.throws(()=>updatePreflight(fixture(t),Number.MAX_SAFE_INTEGER),/disk_space_low/);
});
test('backup failure restores old application and never starts candidate', async () => {
  const calls=[];
  const result=await activateCandidate('new','old',{
    stop:async()=>calls.push('stop'),backup:async()=>{throw new Error('disk full');},
    start:async value=>calls.push(value),healthy:async()=>true,commit:async()=>calls.push('commit'),
  });
  assert.equal(result.phase,'rolled_back');assert.deepEqual(calls,['stop','stop','old']);
});
