import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NC_PLAYWRIGHT_MODULE || '@playwright/test');
const origin = 'http://127.0.0.1:13425';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '13425'], {
  stdio: 'ignore', env: { ...process.env, NC_DEPLOYMENT_ENV: 'test', NC_LOCAL_DATA_PILOT_ENABLED: 'false', NC_CONNECTOR_PULL_ENABLED: 'false', NC_COMMUNITY_AVAILABILITY_ENABLED: 'false' },
});
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  let linked = false, failShops = false, phase = 'idle', current = '0.1.0-preview.24', verified = false;
  const shop = { shop_uuid: '11111111-1111-4111-8111-111111111111', shop_id: 'fixture-store', platform: 'prestashop' };
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body = {}, status = 200;
    if (request.method() === 'POST') mutations.push(path);
    if (path.endsWith('/capabilities')) body = {
      schema_version: '1.1', manifest: { authority: 'neurocheckout_cloud', deny_by_default: true },
      plan: { code: 'community', edition: 'community' }, subscription: { status: 'free_active', active: true },
      limits: { shops: 1, active_agents: 8, emails: { limit: 100, used: 0, remaining: 100 } },
      features: { member_dashboard: true, sync_health: true }, agents: { available: [], coordination_enabled: true },
      dashboard: { current_version: current, latest_version: '0.1.0-preview.25', update_required: false, update_recommended: current !== '0.1.0-preview.25' },
      connectors: [], upgrade: { available: false, target_plans: [] },
    };
    else if (path.endsWith('/local-update')) {
      if (request.method() === 'POST') { phase = 'queued'; status = 202; }
      body = { available: true, phase, version: '0.1.0-preview.25', current_version: current, latest_version: '0.1.0-preview.25', completion_verified: verified };
    }
    else if (path.endsWith('/shops')) {
      status = failShops ? 503 : 200;
      body = failShops ? { detail: 'private_exception_DO_NOT_DISPLAY' } : { items: linked ? [shop] : [] };
    }
    else if (path.endsWith('/setup')) body = { enabled: false, configured: false };
    else if (path.endsWith('/sync-health')) body = { state: 'synchronizing', online: true, queue: {}, data_quality: {}, evidence: {} };
    else if (path.endsWith('/email-profile')) body = { item: { locale: 'en', tone: 'friendly', required_terms: [], forbidden_terms: [], signature: '' } };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin);
  const checklist = page.locator('.setup-checklist');
  await checklist.getByRole('button', { name: 'Check again' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.setup-checklist')?.getAttribute('aria-busy') === 'false');
  assert.equal(await checklist.locator('li > div > span').filter({ hasText: /^Done$/ }).count(), 1);
  linked = true;
  await checklist.getByRole('button', { name: 'Check again' }).click();
  await checklist.getByText('fixture-store · prestashop').waitFor();
  assert.equal(await checklist.locator('li > div > span').filter({ hasText: /^Done$/ }).count(), 2, 'A key or online flag is not evidence of a configured connector');
  await checklist.getByRole('checkbox').check();
  await page.reload();
  await checklist.getByRole('checkbox').waitFor();
  assert(await checklist.getByRole('checkbox').isChecked());
  if (process.env.NC_TEST_SCREENSHOT) await checklist.screenshot({ path: process.env.NC_TEST_SCREENSHOT });
  failShops = true;
  await checklist.getByRole('button', { name: 'Check again' }).click();
  await checklist.getByRole('alert').waitFor();
  assert(!(await page.locator('body').innerText()).includes('private_exception'));
  assert.equal(mutations.length, 0, 'The guide must not mutate account or billing settings');
  failShops = false;
  await page.goto(origin + '/?tool=connector#configuration');
  await page.getByRole('tab', { name: 'Connector', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'Connector', exact: true }).getAttribute('aria-selected'), 'true');
  await page.goto(origin);
  const update = page.getByRole('button', { name: 'Update securely', exact: true });
  await update.click();
  assert.equal(mutations.length, 0);
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  assert.equal(mutations.length, 0);
  await update.click();
  await page.getByRole('button', { name: 'Install now', exact: true }).click();
  phase = 'complete'; // A launcher marker alone must not display success.
  await page.getByText('Verifying the running version…', { exact: true }).waitFor();
  assert.equal(await page.getByText('Update complete.', { exact: true }).count(), 0);
  current = '0.1.0-preview.25'; verified = true;
  await page.waitForFunction(() => !document.querySelector('.local-update-actions'), null, { timeout: 15000 });
  assert.deepEqual(mutations, ['/api/local-update']);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
  assert.deepEqual(errors, []);
  console.log('PASS: guided setup, scoped checklist, unavailable checks, connector link, safe update confirmation and verified completion.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
