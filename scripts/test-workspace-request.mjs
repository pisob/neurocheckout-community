import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRequestShop } from './workspace-request.mjs';

const a = '00000000-0000-4000-8000-00000000000a';
const b = '00000000-0000-4000-8000-00000000000b';

test('shop context comes from the specific resource, not global UI state', () => {
  assert.equal(workspaceRequestShop(`/api/v1/member/shops/${a}/byok`), a);
  assert.equal(workspaceRequestShop(`/api/v1/member/analytics/journey-audit?shop_uuid=${b}`), b);
  assert.equal(workspaceRequestShop('/api/v1/member/api-keys/create', JSON.stringify({ shop_uuid: b })), b);
  assert.equal(workspaceRequestShop(`/api/v1/member/shops/${a.toUpperCase()}?shop_uuid=${a}`), a);
});

test('account routes and the list of shops do not inherit another shop context', () => {
  for (const path of ['shops', 'shops/platforms', 'capabilities', 'notifications']) {
    assert.equal(workspaceRequestShop(`/api/v1/member/${path}`), null);
  }
  assert.equal(workspaceRequestShop('/api/v1/billing/upgrade-session', '{"plan_code":"pro"}'), null);
});

test('contradictory path, query or mutation identities fail closed', () => {
  assert.throws(() => workspaceRequestShop(`/api/v1/member/shops/${a}?shop_uuid=${b}`), /shop_conflict/);
  assert.throws(() => workspaceRequestShop(`/api/v1/member/shops/${a}`, JSON.stringify({ shop_uuid: b })), /shop_conflict/);
  assert.throws(() => workspaceRequestShop(`/api/v1/member/analytics/journey-audit?shop_uuid=${a}&shop_uuid=${b}`), /shop_conflict/);
});

test('malformed contexts and non-API URLs cannot select a vault', () => {
  for (const value of ['', '../woo', 'woo', null, {}, 42]) {
    assert.throws(() => workspaceRequestShop('/api/v1/member/api-keys/create', JSON.stringify({ shop_uuid: value })), /shop_invalid/);
  }
  assert.throws(() => workspaceRequestShop('https://other.invalid/api/v1/member/shops'), /request_invalid/);
});
