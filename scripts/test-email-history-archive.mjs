import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/email-history-archive.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { enrichEmailHistory } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const sent_at = '2026-09-01T12:00:00Z';
const item = (id) => ({ delivery_id: id, sent_at, subject: 'Cloud subject', status: 'converted', converted_at: sent_at });
const copy = (id) => ({ delivery_id: id, subject: 'Archived subject', recipient_email: 'test@example.invalid', body_html: '<p>Original</p>' });
const calls = [];
const conversions = [];
const archive = {
  get(id) { if (id === 'broken') throw Error('unreadable'); return copy(id); },
  confirm(id) { calls.push(id); if (id === 'retry') throw Error('busy'); },
  markConverted(id, at) { conversions.push([id, at]); },
};
const result = enrichEmailHistory([item('broken'), item('good'), item('retry')], archive);
assert.equal(result.length, 3);
assert.equal(result[0].preview_available, false);
assert.equal(result[0].preview_state, 'read_error');
assert.equal(result[1].preview_state, 'available');
assert.equal(enrichEmailHistory([item('missing')])[0].preview_state, 'unavailable');
assert(!JSON.stringify(result).includes('unreadable'));
for (const row of result.slice(1)) {
  assert.equal(row.subject, 'Archived subject');
  assert.equal(row.body_html, '<p>Original</p>');
  assert.equal(row.status, 'converted');
  assert.equal(row.converted_at, sent_at);
}
assert.deepEqual(calls, ['good', 'retry']);
assert.deepEqual(conversions, [['good', sent_at], ['retry', sent_at]]);
assert.equal(enrichEmailHistory([item('good')], { get: () => copy('wrong'), confirm() { throw Error('must not confirm'); } })[0].preview_available, false);
assert.equal(enrichEmailHistory([{ ...item('good'), sent_at: null }], archive)[0].preview_available, false);
const cloud = { ...item('cloud'), body_html: '<p>Cloud original</p>' };
assert.equal(enrichEmailHistory([cloud])[0].preview_available, true);
assert.equal(enrichEmailHistory([cloud], { get: () => ({ delivery_id: 'cloud', body_html: '', subject: '' }), confirm() {} })[0].body_html, cloud.body_html);
assert.equal(enrichEmailHistory(Array.from({ length: 15 }, (_, i) => item(String(i))), archive).length, 15);
console.log('Archive isolation, exact identity, confirmation failure, Cloud fallback and status preservation passed.');

const installation = '11111111-1111-4111-8111-111111111111';
const marketingItem = { delivery_id:'community-marketing-41', sent_at, status:'clicked',
  shop_id:'synthetic-shop', installation_id:installation, content_location:'community_local',
  agent_name:'customer_preference_proactive', community_copy_signature:'b'.repeat(64),
  copy_diagnostic:{source:'db',variant_id:42,language:'fr'}, conversion_tracking_available:false,
  clicked_at:sent_at, converted_at:null, customer:{} };
const marketingCopy = { ...copy(marketingItem.delivery_id), body_text:'Original recommendation',
  agent_name:marketingItem.agent_name, copy_signature:marketingItem.community_copy_signature, variant_id:42, language:'fr' };
const confirmed=[];
const marketingArchive = { store:{config:{shopId:'synthetic-shop'}}, installationId:()=>installation,
  get:()=>marketingCopy, confirm:(...args)=>confirmed.push(args), markConverted:()=>assert.fail('No inferred conversion') };
const enriched=enrichEmailHistory([marketingItem],marketingArchive)[0];
assert.equal(enriched.preview_available,true);assert.equal(enriched.subject,marketingCopy.subject);
assert.equal(enriched.agent_name,marketingItem.agent_name);assert.equal(enriched.status,'clicked');
assert.deepEqual(enriched.copy_diagnostic,marketingItem.copy_diagnostic);
assert.equal(enriched.conversion_tracking_available,false);assert.equal(enriched.converted_at,null);
assert.deepEqual(confirmed,[[marketingItem.delivery_id,sent_at]]);
const neverConfirm={...marketingArchive,confirm:()=>assert.fail('Invalid original must not be confirmed')};
for(const changes of [
  {shop_id:'other'}, {installation_id:'other'}, {community_copy_signature:'c'.repeat(64)},
  {community_copy_signature:undefined}, {agent_name:'abandoned_cart'},
  {copy_diagnostic:{source:'db',variant_id:43,language:'fr'}},
  {copy_diagnostic:{source:'db',variant_id:42,language:'en'}},
  {copy_diagnostic:{source:'db',variant_id:true,language:'fr'}}, {copy_diagnostic:null},
  {content_location:'cloud'}, {status:'sending'}, {status:'pending'}, {status:'converted'},
  {delivery_id:'community-marketing-041'}, {sent_at:null},
]) {
  const row=enrichEmailHistory([{...marketingItem,subject:'Do not borrow this copy',body_html:'<p>unverified</p>',...changes}],neverConfirm)[0];
  assert.equal(row.preview_available,false);assert.equal(row.subject,null);assert.equal(row.body_html,null);
}
for(const changes of [{copy_signature:'c'.repeat(64)},{variant_id:43},{language:'en'},
  {agent_name:'intelligent_email_marketing'},{delivery_id:'community-marketing-42'},{body_text:undefined}]) {
  assert.equal(enrichEmailHistory([marketingItem],{...neverConfirm,get:()=>({...marketingCopy,...changes})})[0].preview_available,false);
}
assert.equal(enrichEmailHistory([marketingItem],{...neverConfirm,installationId:()=>null})[0].preview_available,false);
assert.equal(enrichEmailHistory([marketingItem],{...neverConfirm,get:()=>{throw Error('private decrypt failure');}})[0].preview_state,'read_error');
assert.equal(enrichEmailHistory([marketingItem],{...marketingArchive,confirm:()=>{throw Error('busy');}})[0].preview_available,true);
assert.equal(enrichEmailHistory([marketingItem])[0].preview_available,false);
console.log('Recommendation originals: scope, signature, agent, DB variant, status and confirmation isolation passed.');
