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
 assert.deepEqual(archive.prepare({...copy(1),subject:'A different generated subject',copy_signature:'b'.repeat(64)}).copy,copy(1));
 assert.equal(archive.installationId(),null);
 archive.store.bindInstallation('11111111-1111-4111-8111-111111111111');
 assert.equal(archive.installationId(),'11111111-1111-4111-8111-111111111111');
 assert.throws(()=>archive.prepare({...copy(1),recipient_email:'other@example.invalid'}),/conflict/);
 assert.equal(archive.db.prepare('SELECT sent_at FROM email_archive').get().sent_at,null);
 archive.close();
 for(const file of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  const bytes=readFileSync(join(dir,file));assert.equal(bytes.includes(Buffer.from('PRIVATE ORIGINAL')),false);assert.equal(bytes.includes(Buffer.from('private@example.invalid')),false);
 }
 archive=new EmailArchive(dir);assert.deepEqual(archive.get('community-edge-1'),copy(1));archive.close();
});
test('latest fifty confirmed copies retained, preparations bounded and expired', t => {
 const dir=setup(t);let now=Date.now();const archive=new EmailArchive(dir,()=>now);
 for(let id=1;id<=52;id++) {archive.prepare(copy(id));archive.confirm(`community-edge-${id}`,new Date(now+id).toISOString());}
 assert.equal(archive.get('community-edge-1'),null);assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,50);
 for(let id=100;id<200;id++)archive.prepare(copy(id));
 assert.throws(()=>archive.prepare(copy(200)),/full/);
 now+=31*86400000;archive.clean();assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,0);archive.close();
});
test('known converted originals survive newer sends, restart and backup with bounded retention', t => {
 const dir=setup(t);let now=Date.now();let archive=new EmailArchive(dir,()=>now);
 for(let id=1;id<=101;id++) {
  archive.prepare(copy(id));archive.confirm(`community-edge-${id}`,new Date(now+id).toISOString());
  if(id<=51) archive.markConverted(`community-edge-${id}`,new Date(now+id).toISOString());
 }
 assert.equal(archive.get('community-edge-1'),null);
 assert.deepEqual(archive.get('community-edge-2'),copy(2));
 assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,100);
 const backup=join(dir,'backup');archive.store.backup(backup);archive.close();
 archive=new EmailArchive(backup,()=>now);
 assert.deepEqual(archive.get('community-edge-2'),copy(2));
 assert.throws(()=>archive.markConverted('community-edge-2','not-a-date'),/invalid/);
 now+=31*86400000;archive.clean();
 assert.equal(archive.get('community-edge-2'),null);
 assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive_conversions').get().n,0);archive.close();
});
test('size limits and authenticated ciphertext reject unsafe data',t=>{
 const dir=setup(t),archive=new EmailArchive(dir);
 assert.throws(()=>archive.prepare({...copy(1),body_html:'x'.repeat(65537)}),/invalid/);
 assert.throws(()=>archive.prepare({...copy(1),shop_id:'other'}),/invalid/);
 archive.prepare(copy(1));archive.db.prepare('UPDATE email_archive SET id=?').run('community-edge-2');assert.throws(()=>archive.get('community-edge-2'));archive.close();
});
test('recommendation copies remain distinct from carts, encrypted and immutable after restart and backup',t=>{
 const dir=setup(t);let archive=new EmailArchive(dir);
 const marketing={...copy(1),delivery_id:'community-marketing-1',agent_name:'customer_preference_proactive',variant_id:42,language:'en'};
 archive.prepare(copy(1));archive.prepare(marketing);
 assert.deepEqual(archive.prepare({...marketing,subject:'regenerated',variant_id:43,language:'fr'}).copy,marketing);
 for(const change of [{variant_id:true},{variant_id:0},{variant_id:'42'},{variant_id:9007199254740992},{language:null},{language:'invalid-language'}]) {
  assert.throws(()=>archive.prepare({...marketing,...change}),/invalid/);
 }
 for(const key of ['variant_id','language']) {
  const missing={...marketing};delete missing[key];assert.throws(()=>archive.prepare(missing),/invalid/);
 }
 assert.throws(()=>archive.prepare({...marketing,agent_name:'intelligent_email_marketing'}),/conflict/);
 assert.throws(()=>archive.prepare({...marketing,delivery_id:'community-marketing-2',agent_name:'abandoned_cart'}),/invalid/);
 const second={...marketing,delivery_id:'community-marketing-2',agent_name:'intelligent_email_marketing'};
 archive.prepare(second);archive.confirm(marketing.delivery_id,new Date().toISOString());
 archive.markConverted(marketing.delivery_id,new Date().toISOString());
 const backup=join(dir,'backup');archive.store.backup(backup);archive.close();
 for(const file of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  const bytes=readFileSync(join(dir,file));assert(!bytes.includes(Buffer.from('PRIVATE ORIGINAL')));assert(!bytes.includes(Buffer.from('private@example.invalid')));
 }
 archive=new EmailArchive(backup);
 assert.deepEqual(archive.get('community-edge-1'),copy(1));assert.deepEqual(archive.get(marketing.delivery_id),marketing);
 assert.deepEqual(archive.get(second.delivery_id),second);
 // An attacker cannot relabel a cart ciphertext as a marketing original.
 archive.db.prepare('UPDATE email_archive SET ciphertext=(SELECT ciphertext FROM email_archive WHERE id=?) WHERE id=?').run('community-edge-1',marketing.delivery_id);
 assert.throws(()=>archive.get(marketing.delivery_id));archive.close();
});
test('invalid ids and missing originals never produce a false confirmation',t=>{
 const dir=setup(t),archive=new EmailArchive(dir),sentAt=new Date().toISOString();
 for(const id of [null,1,['community-edge-1'],'community-marketing-0','community-marketing-01','community-marketing-12345678901234567']) {
  assert.throws(()=>archive.prepare({...copy(1),delivery_id:id}),/invalid/);
  assert.throws(()=>archive.confirm(id,sentAt),/invalid/);
  assert.throws(()=>archive.markConverted(id,sentAt),/invalid/);
  assert.equal(archive.get(id),null);
 }
 assert.throws(()=>archive.confirm('community-marketing-1',sentAt),/unavailable/);
 archive.prepare(copy(1));archive.confirm('community-edge-1',sentAt);archive.confirm('community-edge-1',sentAt);
 archive.close();
});

const recommendation = () => ({...copy(1),delivery_id:'community-marketing-1',agent_name:'customer_preference_proactive',variant_id:42,language:'en',
 recommendation_context:{schema:1,playbook_code:'customer_preference_proactive',currency:'EUR',products:[
  {product_id:'123',attribute_id:'2',category_path:'PRIVATE CATEGORY',brand_name:'PRIVATE BRAND',price_band:'mid'}]}});
test('recommendation facts stay encrypted and immutable through restart and backup',t=>{
 const dir=setup(t);let archive=new EmailArchive(dir);const original=recommendation();
 archive.prepare(original);
 const changed=structuredClone(original);changed.recommendation_context.products[0].product_id='999';changed.copy_signature='b'.repeat(64);
 assert.deepEqual(archive.prepare(changed).copy,original);
 archive.confirm(original.delivery_id,new Date().toISOString());
 const backup=join(dir,'backup');archive.store.backup(backup);archive.close();
 for(const file of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  const bytes=readFileSync(join(dir,file));
  for(const privateText of ['PRIVATE CATEGORY','PRIVATE BRAND','recommendation_context']) assert(!bytes.includes(Buffer.from(privateText)));
 }
 archive=new EmailArchive(backup);assert.deepEqual(archive.get(original.delivery_id),original);archive.close();
});
test('legacy recommendation originals remain unchanged when retried with new facts',t=>{
 const dir=setup(t),archive=new EmailArchive(dir),legacy=recommendation();delete legacy.recommendation_context;
 archive.prepare(legacy);assert.deepEqual(archive.prepare(recommendation()).copy,legacy);archive.close();
});
test('schema two offer fingerprints remain encrypted and immutable after backup',t=>{
 const dir=setup(t);let archive=new EmailArchive(dir);const original=recommendation();
 original.recommendation_context.schema=2;
 original.recommendation_context.products[0].offer_digest='abcdef0123456789'.repeat(4);
 archive.prepare(original);
 const changed=structuredClone(original);changed.recommendation_context.products[0].offer_digest='b'.repeat(64);
 assert.deepEqual(archive.prepare(changed).copy,original);
 const backup=join(dir,'backup');archive.store.backup(backup);archive.close();
 for(const file of readdirSync(dir).filter(f=>f.startsWith('local-data.sqlite'))) {
  const bytes=readFileSync(join(dir,file));
  assert(!bytes.includes(Buffer.from(original.recommendation_context.products[0].offer_digest)));
 }
 archive=new EmailArchive(backup);assert.deepEqual(archive.get(original.delivery_id),original);archive.close();
});
test('schema one originals are never upgraded by a retry with offer fingerprints',t=>{
 const dir=setup(t),archive=new EmailArchive(dir),original=recommendation(),changed=structuredClone(original);
 changed.recommendation_context.schema=2;changed.recommendation_context.products[0].offer_digest='a'.repeat(64);
 archive.prepare(original);assert.deepEqual(archive.prepare(changed).copy,original);archive.close();
});
test('schema two requires exact offer fingerprints and schema one rejects them',t=>{
 const dir=setup(t),archive=new EmailArchive(dir);
 for(const digest of [undefined,null,true,12,'a'.repeat(63),'A'.repeat(64),'g'.repeat(64),'a'.repeat(64)+'\n']) {
  const value=recommendation();value.recommendation_context.schema=2;
  if(digest!==undefined)value.recommendation_context.products[0].offer_digest=digest;
  assert.throws(()=>archive.prepare(value),/invalid/);
 }
 const old=recommendation();old.recommendation_context.products[0].offer_digest='a'.repeat(64);
 assert.throws(()=>archive.prepare(old),/invalid/);
 assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,0);archive.close();
});
test('invalid private recommendation facts fail before persistence',t=>{
 const dir=setup(t),archive=new EmailArchive(dir);
 const invalid=[v=>v.recommendation_context=null,v=>v.recommendation_context.schema=true,
  v=>v.recommendation_context.currency='eur',v=>v.recommendation_context.playbook_code='win_back_at_risk',
  v=>v.recommendation_context.products=[],v=>v.recommendation_context.products.push({...v.recommendation_context.products[0],attribute_id:'3'}),
  v=>v.recommendation_context.products[0].product_id='01',v=>v.recommendation_context.products[0].attribute_id=0,
  v=>v.recommendation_context.products[0].product_id='1\n',v=>v.recommendation_context.currency='EUR\n',
  v=>v.recommendation_context.products[0].price_band='unknown',v=>v.recommendation_context.products[0].category_path='é'.repeat(121),
  v=>v.recommendation_context.products[0].brand_name='bad\nlabel',v=>v.recommendation_context.products[0].customer_email='private@example.invalid',
  v=>v.delivery_id='community-edge-1'];
 for(const mutate of invalid){const value=recommendation();mutate(value);assert.throws(()=>archive.prepare(value),/invalid/);}
 assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive').get().n,0);archive.close();
});

test('generated originals keep no DB variant identity and remain immutable',t=>{
 const dir=setup(t);let archive=new EmailArchive(dir);
 const original={...copy(1),delivery_id:'community-marketing-1',agent_name:'intelligent_email_marketing',variant_id:null,language:'fr'};
 assert.deepEqual(archive.prepare(original).copy,original);
 archive.close();archive=new EmailArchive(dir);
 assert.deepEqual(archive.get(original.delivery_id),original);
 assert.deepEqual(archive.prepare({...original,subject:'replacement',variant_id:42}).copy,original);
 archive.close();
});
