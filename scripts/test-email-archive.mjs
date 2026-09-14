import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeLocalData } from './local-data-store.mjs';
import { EmailArchive } from './email-archive.mjs';
const copy = id => ({ delivery_id:`community-edge-${id}`,recipient_email:'private@example.invalid',subject:'Original subject',body_html:'<p>PRIVATE ORIGINAL MESSAGE</p>',body_text:'PRIVATE ORIGINAL MESSAGE',agent_name:'abandoned_cart',copy_signature:'a'.repeat(64) });
function setup(t) { const dir=mkdtempSync(join(tmpdir(),'nc-email-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));initializeLocalData(dir,'synthetic-shop');return dir; }
test('copies are encrypted, immutable across retries and survive restart', t => {
 const dir=setup(t);let archive=new EmailArchive(dir);
 assert.deepEqual(archive.prepare(copy(1)).copy,copy(1));
 assert.deepEqual(archive.prepare({...copy(1),body_html:'regenerated'}).copy,copy(1));
 assert.throws(()=>archive.prepare({...copy(1),recipient_email:'other@example.invalid'}),/conflict/);
 assert.equal(archive.db.prepare('SELECT sent_at FROM email_archive').get().sent_at,null);
 archive.close();
 for(const file of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  const bytes=readFileSync(join(dir,file));assert.equal(bytes.includes(Buffer.from('PRIVATE ORIGINAL')),false);assert.equal(bytes.includes(Buffer.from('private@example.invalid')),false);
 }
 archive=new EmailArchive(dir);assert.deepEqual(archive.get('community-edge-1'),copy(1));archive.close();
});
test('only latest ten confirmed copies retained, preparations bounded and expired', t => {
 const dir=setup(t);let now=Date.now();const archive=new EmailArchive(dir,()=>now);
 for(let id=1;id<=12;id++) {archive.prepare(copy(id));archive.confirm(`community-edge-${id}`,new Date(now+id).toISOString());}
 assert.equal(archive.get('community-edge-1'),null);assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,10);
 for(let id=20;id<120;id++)archive.prepare(copy(id));
 assert.throws(()=>archive.prepare(copy(120)),/full/);
 now+=31*86400000;archive.clean();assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,0);archive.close();
});
test('size limits and authenticated ciphertext reject unsafe data',t=>{
 const dir=setup(t),archive=new EmailArchive(dir);
 assert.throws(()=>archive.prepare({...copy(1),body_html:'x'.repeat(65537)}),/invalid/);
 assert.throws(()=>archive.prepare({...copy(1),shop_id:'other'}),/invalid/);
 archive.prepare(copy(1));archive.db.prepare('UPDATE email_archive SET id=?').run('community-edge-2');assert.throws(()=>archive.get('community-edge-2'));archive.close();
});
