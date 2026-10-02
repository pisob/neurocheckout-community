// Real standalone Community server + synthetic Cloud. Never contacts staging,
// Stripe, shops or customers. Tests the OAuth/BFF/vault/worker path end to end.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeLocalData } from './local-data-store.mjs';
import { EmailArchive } from './email-archive.mjs';
import { workspaceStoreDirectory, workspaceChildDirectories } from './workspace-store.mjs';

const directory = mkdtempSync(resolve(tmpdir(), 'nc-workspace-smoke-'));
const root = resolve(directory, 'state'), standalone = resolve('.next/standalone');
const origin = 'http://127.0.0.1:43120', cookies = new Map();
const parent = { shop_uuid: '11111111-1111-4111-8111-111111111111', installation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', shop_id: 'fixture-woo', platform: 'woocommerce' };
const child = { shop_uuid: '22222222-2222-4222-8222-222222222222', installation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', shop_id: 'fixture-magento', platform: 'magento' };
const token = prefix => prefix + randomBytes(32).toString('base64url');
const rootRelay = token('nc_data_'), childRelay = token('nc_data_');
const rootLive = token('nc_live_'), childLive = token('nc_live_');
const credential = (grant, value) => ({ token: value, installation_id: grant.installation_id, shop_id: grant.shop_id });
const copy = subject => ({ delivery_id: 'community-edge-1', recipient_email: 'synthetic@example.invalid', subject,
  body_html: `<p>${subject}</p>`, body_text: subject, agent_name: 'abandoned_cart', copy_signature: 'a'.repeat(64) });
initializeLocalData(root, parent.shop_id);
const originalKeys = readFileSync(resolve(root, 'local-data-keys.json'));
const archive = new EmailArchive(root); archive.prepare(copy('Woo original')); archive.close();
let authorized = true, childHeartbeats = 0, childPolls = 0, childCopies = 0;
const cloudErrors = [];
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = async request => { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || '{}'); };
const cloud = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://cloud.invalid');
    if (url.pathname.endsWith('/oauth/token')) return json(res, 200, {
      access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 900,
      scope: 'openid shops:read connectors:write emails:read', availability_token: rootLive,
      local_data_credential: credential(parent, rootRelay),
    });
    if (url.pathname.endsWith('/oauth/heartbeat')) {
      if (req.headers.authorization === `Bearer ${childLive}`) {
        if (!authorized) return json(res, 401, {});
        childHeartbeats++;
      } else assert.equal(req.headers.authorization, `Bearer ${rootLive}`);
      return json(res, 200, { ok: true });
    }
    if (url.pathname.includes('/community-relay/')) {
      if (req.headers.authorization === `Bearer ${rootRelay}`) return json(res, 200, { commands: [] });
      assert.equal(req.headers.authorization, `Bearer ${childRelay}`);
      if (!authorized) return json(res, 401, {});
      if (url.pathname.endsWith('/poll')) {
        childPolls++;
        return json(res, 200, { commands: childCopies ? [] : [{ operation: 'archive_email', request_id: 'c'.repeat(32), record: copy('Magento original') }] });
      }
      if (url.pathname.endsWith('/reply')) {
        assert.equal((await body(req)).result.copy.subject, 'Magento original');
        childCopies++;
        return json(res, 200, { accepted: true });
      }
    }
    assert.equal(req.headers.authorization, 'Bearer synthetic-access');
    if (url.pathname.endsWith('/workspace')) return json(res, 200, { items: authorized ? [parent, child] : [parent] });
    if (url.pathname.endsWith('/workspace/bootstrap')) {
      assert.equal((await body(req)).target_shop_uuid, child.shop_uuid);
      assert.equal(req.headers['x-neurocheckout-workspace-shop'], undefined);
      return json(res, authorized ? 200 : 403, { grant: child, availability_token: childLive, local_data_credential: credential(child, childRelay) });
    }
    if (url.pathname.endsWith('/community-source-binding')) {
      assert.equal(req.headers['x-neurocheckout-workspace-shop'], child.shop_uuid);
      return json(res, authorized ? 200 : 403, { schema: 1, shop_id: child.shop_id, platform: 'magento', endpoint: 'https://magento.example.invalid/rest/V1/neurocheckout/community/pull', secret: 'ab'.repeat(32) });
    }
    if (url.pathname.endsWith('/recent-emails')) {
      const grant = url.searchParams.get('shop_uuid') === parent.shop_uuid ? parent : child;
      assert.equal(req.headers['x-neurocheckout-workspace-shop'], grant.shop_uuid);
      if (!authorized && grant === child) return json(res, 403, { detail: 'forbidden' });
      return json(res, 200, { shop: grant, items: [{ delivery_id: 'community-edge-1', status: 'sent', sent_at: new Date().toISOString() }] });
    }
    if (url.pathname.endsWith('/shops')) return json(res, 200, { items: authorized ? [parent, child] : [parent] });
    return json(res, 404, {});
  } catch (error) { cloudErrors.push(error.message); json(res, 500, { detail: 'synthetic_failure' }); }
});
await new Promise(done => cloud.listen(0, '127.0.0.1', done));
const cloudOrigin = `http://127.0.0.1:${cloud.address().port}`;
cpSync(resolve('.next/static'), resolve(standalone, '.next/static'), { recursive: true });
if (existsSync('public')) cpSync('public', resolve(standalone, 'public'), { recursive: true });
const options = { cwd: standalone, stdio: 'ignore', env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: '43120',
  NC_COMMUNITY_STATE_DIRECTORY: root, NC_DEPLOYMENT_ENV: 'staging', NC_LOCAL_DATA_PILOT_ENABLED: 'true',
  NC_COMMUNITY_MULTISTORE_ENABLED: 'true', NC_CONNECTOR_PULL_ENABLED: 'false',
  NC_CLOUD_API_BASE_URL: cloudOrigin, NC_CLOUD_AUTHORIZATION_URL: `${cloudOrigin}/authorize`,
  NC_COMMUNITY_CLIENT_ID: 'synthetic-workspace-client', NC_COMMUNITY_REDIRECT_URI: `${origin}/api/auth/callback`,
  NC_COMMUNITY_SESSION_SECRET: 'synthetic-workspace-secret-at-least-thirty-two-characters', NC_COMMUNITY_COOKIE_SECURE: 'false',
} };
let server;
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function waitFor(check, message) { for (let n = 0; n < 120; n++) { if (await check()) return; await sleep(250); } throw new Error(message); }
async function start() {
  server = spawn(process.execPath, [resolve(standalone, 'server.js')], options);
  await waitFor(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, 'server not ready');
}
async function stop() { if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; } }
async function request(path, init = {}) {
  const response = await fetch(origin + path, { ...init, redirect: 'manual', headers: {
    Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), Origin: origin, 'Content-Type': 'application/json', ...init.headers,
  } });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], pos = pair.indexOf('='); cookies.set(pair.slice(0, pos), pair.slice(pos + 1));
  }
  return response;
}
try {
  await start();
  const login = await request('/api/auth/start');
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await request(`/api/auth/callback?code=synthetic&state=${encodeURIComponent(state)}`);
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get('location')).searchParams.get('connected'), '1');
  const setup = await request('/api/local-data/setup', { method: 'POST', body: JSON.stringify({ shop_uuid: child.shop_uuid }) });
  assert.equal(setup.status, 200, await setup.text());
  await waitFor(() => childCopies > 0 && childHeartbeats > 0, 'independent child workers did not start');
  const childDirectory = workspaceStoreDirectory(root, child);
  assert.deepEqual(workspaceChildDirectories(root), [childDirectory]);
  for (const grant of [parent, child]) {
    const response = await request(`/api/cloud/recent-emails?shop_uuid=${grant.shop_uuid}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items[0].subject, grant === parent ? 'Woo original' : 'Magento original');
  }
  const before = childPolls;
  await stop(); await start();
  await waitFor(() => childPolls > before, 'child did not resume without browser login');
  authorized = false;
  assert.equal((await request(`/api/cloud/recent-emails?shop_uuid=${child.shop_uuid}`)).status, 403);
  assert.equal((await request(`/api/cloud/recent-emails?shop_uuid=${parent.shop_uuid}`)).status, 200);
  assert.deepEqual(readFileSync(resolve(root, 'local-data-keys.json')), originalKeys);
  assert.deepEqual(cloudErrors, []);
  console.log('PASS: actual standalone OAuth, child bootstrap, encrypted archives with identical IDs, independent workers, restart and revoked access.');
} finally {
  await stop(); await new Promise(done => cloud.close(done));
  rmSync(directory, { recursive: true, force: true });
}
