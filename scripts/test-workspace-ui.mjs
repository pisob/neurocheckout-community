import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:13442';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '13442'], {
  stdio: 'ignore', env: { ...process.env, NC_DEPLOYMENT_ENV: 'test', NC_LOCAL_DATA_PILOT_ENABLED: 'false', NC_CONNECTOR_PULL_ENABLED: 'false' },
});
const shops = [
  { shop_uuid: '11111111-1111-4111-8111-111111111111', shop_id: 'fixture-woo', platform: 'woocommerce', has_active_api_key: true },
  { shop_uuid: '22222222-2222-4222-8222-222222222222', shop_id: 'fixture-magento', platform: 'magento', has_active_api_key: false },
];
let browser;
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const selected = shops.find(shop => shop.shop_uuid === url.searchParams.get('shop_uuid')) || shops[0];
    let body = {};
    if (path.endsWith('/capabilities')) body = {
      schema_version: '1.1', manifest: { authority: 'neurocheckout_cloud', deny_by_default: true },
      plan: { code: 'pro', edition: 'community' }, subscription: { status: 'paid_active', active: true },
      limits: { shops: 4, active_agents: 8, emails: { limit: 1000, used: 0, remaining: 1000 } },
      features: { member_dashboard: true }, agents: { available: [] }, connectors: [], dashboard: {},
      upgrade: { available: false, target_plans: [] },
    };
    else if (path.endsWith('/shops')) body = { items: shops };
    else if (path.endsWith('/email-profile')) {
      await new Promise(resolve => setTimeout(resolve, 150));
      body = { item: { locale: 'en', tone: 'warm', required_terms: [selected.shop_id], forbidden_terms: [], signature: selected.shop_id } };
    } else if (path.endsWith('/byok')) body = { configured: false };
    else if (path.endsWith('/setup')) {
      if (request.method() === 'POST') {
        mutations.push({ path, body: request.postDataJSON() });
        body = { status: 'synchronizing' };
      } else body = { available: true, configured: selected === shops[0], shopId: selected.shop_id };
    } else if (path.endsWith('/connector-key')) {
      mutations.push({ path, body: request.postDataJSON() });
      body = { api_key: 'synthetic-magento-key' };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${origin}/?connected=1&tool=connector#configuration`);
  const selector = page.locator('.configuration-toolbar .shop-selector select');
  await expect(selector).toBeEnabled();
  await expect(selector.locator('option')).toHaveCount(2);
  await selector.selectOption(shops[1].shop_uuid);
  await expect(selector).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create key', exact: true })).toBeDisabled();
  await page.locator('#configuration input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByText('synthetic-magento-key', { exact: true }).waitFor();
  assert.equal(mutations.length, 2);
  assert(mutations.every(item => item.body.shop_uuid === shops[1].shop_uuid));
  await expect(selector).toBeEnabled();
  await selector.selectOption(shops[0].shop_uuid);
  await expect(selector).toBeEnabled();
  await expect(page.getByText('synthetic-magento-key', { exact: true })).toHaveCount(0);
  await expect(page.locator('#configuration input[type=checkbox]')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Rotate key', exact: true })).toBeDisabled();
  assert.deepEqual(errors, []);
  console.log('PASS: Woo/Magento selection, exact shop mutations, DPA reset and key isolation.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await once(server, 'exit');
}
