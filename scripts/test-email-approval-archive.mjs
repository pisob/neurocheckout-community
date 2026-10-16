import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichEmailApprovals } from '../lib/email-approval-archive.ts';
import { readApprovalRequest } from '../lib/approval-request.ts';

const item = { id: 'approval', delivery_id: 'community-edge-41', shop_id: 'shop-a', installation_id: 'install-a',
  content_location: 'community_local', community_copy_signature: 'a'.repeat(64), status: 'pending' };
const copy = { delivery_id: item.delivery_id, copy_signature: item.community_copy_signature, subject: 'Exact subject',
  recipient_email: 'fixture@example.invalid', body_html: '<p>Signed original</p>', body_text: 'Signed original' };
const archive = { shopId: item.shop_id, installationId: item.installation_id, get: () => copy };
test('only exact local signed original is displayed, without changing status', () => {
  const result = enrichEmailApprovals([item], archive)[0];
  assert.equal(result.preview_available, true);
  assert.equal(result.status, 'pending');
  assert.equal(result.body_html, copy.body_html);
  assert.equal(result.recipient_email, copy.recipient_email);
});
test('recommendations require their own exact copy, never a cart with the same numeric id', () => {
  const marketing={...item,delivery_id:'community-marketing-41'};
  const original={...copy,delivery_id:marketing.delivery_id};
  assert.equal(enrichEmailApprovals([marketing],archive)[0].preview_available,false);
  assert.equal(enrichEmailApprovals([marketing],{...archive,get:()=>original})[0].preview_available,true);
  for(const changed of [{shopId:'other'},{installationId:'other'},{get:()=>({...original,copy_signature:'b'.repeat(64)})}]) {
    const result=enrichEmailApprovals([marketing],{...archive,get:()=>original,...changed})[0];
    assert.equal(result.preview_available,false);assert.equal(result.subject,'');
  }
});
for (const [name, changed] of Object.entries({
  'another shop': { shopId: 'other' }, 'another installation': { installationId: 'other' },
  'missing original': { get: () => null }, 'changed signature': { get: () => ({ ...copy, copy_signature: 'b'.repeat(64) }) },
  'wrong delivery': { get: () => ({ ...copy, delivery_id: 'community-edge-42' }) },
  'corrupt copy': { get: () => { throw Error('private diagnostic'); } },
  'no body': { get: () => ({ ...copy, body_text: '', body_html: '' }) },
})) test(`${name} cannot supply an approval preview`, () => {
  const result = enrichEmailApprovals([{ ...item, subject: 'must be hidden', body_html: 'untrusted' }], { ...archive, ...changed })[0];
  assert.equal(result.preview_available, false);
  assert.equal(result.subject, ''); assert.equal(result.body_html, null);
  assert(!JSON.stringify(result).includes('private diagnostic'));
});
test('missing archive fails closed, legacy Cloud queue remains compatible', () => {
  assert.equal(enrichEmailApprovals([item])[0].preview_available, false);
  const legacy = { subject: 'Legacy', body_html: '<p>Cloud copy</p>' };
  assert.deepEqual(enrichEmailApprovals([legacy]), [legacy]);
});
test('approval action accepts only a bounded signature, never client email content', async () => {
  const request = body => new Request('https://example.invalid', { method: 'POST', body });
  assert.deepEqual(await readApprovalRequest(request('')), {});
  assert.deepEqual(await readApprovalRequest(request(JSON.stringify({ copy_signature: 'a'.repeat(64) }))), { copy_signature: 'a'.repeat(64) });
  for (const body of ['[]', 'null', '{', JSON.stringify({ body_html: '<p>Injected</p>' }), ' '.repeat(513), JSON.stringify({ copy_signature: 123 })]) {
    await assert.rejects(readApprovalRequest(request(body)));
  }
});
