import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { permittedCloud } from './deployment-environment.mjs';
import { saveRelayCredential, relayOnce } from './server-data-relay.mjs';
import { LocalDataStore } from './local-data-store.mjs';
import { EmailArchive } from './email-archive.mjs';

test('production accepts only its canonical Cloud origin', () => {
  assert.equal(permittedCloud('production', 'https://www.neurocheckout.com'), true);
  for (const url of ['https://community-api-staging.neurocheckout.com', 'http://localhost:3400',
    'https://www.neurocheckout.com.evil.invalid', 'https://user@www.neurocheckout.com',
    'https://www.neurocheckout.com/path', 'https://www.neurocheckout.com?key=x', 'https://www.neurocheckout.com:444']) {
    assert.equal(permittedCloud('production', url), false, url);
  }
  assert.equal(permittedCloud('staging', 'https://www.neurocheckout.com'), false);
  assert.equal(permittedCloud('unknown', 'https://www.neurocheckout.com'), false);
});

test('production relay archives locally, refuses cross-environment reuse and makes no real requests', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'nc-prod-relay-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = { directory, enabled: true, environment: 'production',
    cloudUrl: 'https://www.neurocheckout.com', secret: 'synthetic-secret-at-least-32-characters',
    clientId: 'synthetic', port: '3400', version: 'synthetic' };
  const auth = { shop_id: 'synthetic-shop', installation_id: '11111111-1111-4111-8111-111111111111',
    token: 'nc_data_' + randomBytes(32).toString('base64url') };
  await saveRelayCredential(options, auth);
  const store = new LocalDataStore(directory, Date.now, 'production');
  assert.equal(store.config.environment, 'production'); store.close();
  await assert.rejects(saveRelayCredential({ ...options, environment: 'staging',
    cloudUrl: 'https://community-api-staging.neurocheckout.com' }, auth), /configuration_invalid/);
  const copy = { delivery_id: 'community-edge-42', recipient_email: 'synthetic@example.invalid', subject: 'Test',
    body_html: '<p>Test</p>', body_text: 'Test', agent_name: 'abandoned_cart', copy_signature: 'a'.repeat(64) };
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push(url);
    if (url.endsWith('/api/health')) return Response.json({ service: 'neurocheckout-community' });
    assert.ok(url.startsWith(options.cloudUrl + '/api/v1/public/community-relay/'));
    if (url.endsWith('/poll')) return Response.json({ commands: [{ operation: 'archive_email', request_id: 'a'.repeat(32), record: copy }] });
    const response = JSON.parse(init.body);
    assert.equal(response.result.status, 'ok');
    assert.deepEqual(response.result.copy, copy);
    return Response.json({ accepted: true });
  };
  assert.equal(await relayOnce(options, fetchMock), true);
  assert.equal(calls.length, 3);
  const archive = new EmailArchive(directory, Date.now, 'production');
  assert.deepEqual(archive.get(copy.delivery_id), copy); archive.close();
  assert.equal(await relayOnce({ ...options, environment: 'staging' }, () => assert.fail('no network')), false);
});
