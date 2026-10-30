import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeLocalData, LocalDataStore } from './local-data-store.mjs';
import { PrivateStateStore } from './private-state-store.mjs';
const key='a'.repeat(64), state={revision:'b'.repeat(64),value:'PRIVATE STATE CONTENT'};
function fixture(t) {
 const dir=mkdtempSync(join(tmpdir(),'nc-state-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 initializeLocalData(dir,'synthetic-shop');const store=new LocalDataStore(dir);
 store.bindInstallation('11111111-1111-4111-8111-111111111111');return {dir,store};
}
test('opaque state is encrypted, durable and compare-and-swap protects concurrent updates',t=>{
 const {dir,store}=fixture(t);const vault=new PrivateStateStore(store);
 assert.equal(vault.execute({key}),null);
 assert.deepEqual(vault.execute({key,expected_revision:null,state},true),state);
 assert.deepEqual(vault.execute({key,expected_revision:null,state},true),state);
 assert.throws(()=>vault.execute({key,expected_revision:null,state:{...state,revision:'c'.repeat(64)}},true),/conflict/);
 const next={revision:'c'.repeat(64),value:'CHANGED PRIVATE STATE'};
 assert.deepEqual(vault.execute({key,expected_revision:state.revision,state:next},true),next);
 store.close();
 for(const f of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  assert(!readFileSync(join(dir,f)).includes(Buffer.from('PRIVATE STATE')));
 }
 const reopened=new LocalDataStore(dir);assert.deepEqual(new PrivateStateStore(reopened).get(key),next);reopened.close();
});
test('ciphertext is bound to its key and installation; malformed writes fail',t=>{
 const {store}=fixture(t);const vault=new PrivateStateStore(store);
 vault.execute({key,expected_revision:null,state},true);
 for(const record of [{key,state},{key,expected_revision:null,state:{...state,value:'x'.repeat(8193)}},{key:'bad',expected_revision:null,state}]) {
  assert.throws(()=>vault.execute(record,true),/invalid/);
 }
 store.db.prepare('UPDATE private_state SET key=?').run('d'.repeat(64));assert.throws(()=>vault.get('d'.repeat(64)));
 store.db.prepare('UPDATE private_state SET key=?').run(key);
 store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run('22222222-2222-4222-8222-222222222222');
 assert.throws(()=>vault.get(key));store.close();
});
test('state expires and is included in encrypted local backups',t=>{
 const {dir,store}=fixture(t);let now=Date.now();const vault=new PrivateStateStore(store,()=>now);
 vault.execute({key,expected_revision:null,state},true);const backup=join(dir,'backup');store.backup(backup);store.close();
 const reopened=new LocalDataStore(backup);const copy=new PrivateStateStore(reopened,()=>now);
 assert.deepEqual(copy.get(key),state);now+=91*86400000;assert.equal(copy.get(key),null);reopened.close();
});
