import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';

const origin = 'http://127.0.0.1:13442';
const mediaFixture = Buffer.from('UklGRioBAABXRUJQVlA4IB4BAAAQHgCdASpYAsgAPm02mUmkIqKhICgAgA2JaW7hd2Ee3AAAFpbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJx/AAA/v/FFv/1oWhA5//9izlsC04MKEZQoAAAAAAAAAAAAAAAAAAA', 'base64');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '13442'], {
  stdio: 'ignore', env: { ...process.env, NC_DEPLOYMENT_ENV: 'test', NC_LOCAL_DATA_PILOT_ENABLED: 'false', NC_CONNECTOR_PULL_ENABLED: 'false', NC_COMMUNITY_AVAILABILITY_ENABLED: 'false' },
});
let browser;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const page = await browser.newPage(); const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (!req.url().startsWith(origin)) external.push(req.url()); });
  let plan = 'community', status = 'free_active', failFunding = false, failCaps = false, available = true, wrongStripe = false, shortExpiry = false;
  let fundingRequests = 0, paymentRequests = 0;
  let failImage = false, rotate = false;
  const selected = () => page.locator('#community-sponsor-title').textContent();
  const image = { asset_id: 'a'.repeat(64), width: 600, height: 200, animated: true, alt_fr: 'Visuel du partenaire', alt_en: 'Partner creative' };
  const sponsor = { id: 'hosting', url: 'https://partner.example.com/offer', fr: { title: 'Hébergement e-commerce', description: 'Un partenaire pour votre boutique.' }, en: { title: 'E-commerce hosting', description: 'A partner for your store.' } };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; let body = {}, code = 200;
    if (path.includes('/community-funding/media/')) {
      if (failImage) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: 'image/webp', body: mediaFixture });
    }
    if (path.endsWith('/capabilities')) {
      code = failCaps ? 503 : 200;
      body = { schema_version: '1.1', plan: { code: plan, edition: 'community' }, subscription: { status, active: true },
        manifest: { authority: 'neurocheckout_cloud', refresh_after_seconds: 60 }, limits: { shops: 1, active_agents: 8, emails: { limit: 100, used: 4, remaining: 96, window: 'rolling_24h' } },
        features: { member_dashboard: true }, agents: { available: [] }, connectors: [], dashboard: {}, upgrade: { available: false, target_plans: [] } };
    } else if (path.endsWith('/community-funding/support')) {
      paymentRequests++; body = { url: wrongStripe ? 'https://buy.stripe.com/realPayment' : 'https://buy.stripe.com/test_fixture' };
    } else if (path.endsWith('/community-funding')) {
      fundingRequests++; code = failFunding ? 503 : 200;
      body = { schema_version: 1, eligible: true, expires_at: new Date(Date.now()+(shortExpiry ? 1200 : 120000)).toISOString(), sponsor: available ? sponsor : null, ...(rotate ? { sponsors: available ? [sponsor, { ...sponsor, id: 'second', en: { ...sponsor.en, title: 'Second campaign' } }] : [] } : {}), support: available ? { mode: 'test' } : null };
    } else if (path.endsWith('/shops')) body = { items: [] };
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'E-commerce hosting' })).toBeVisible();
  const ad = page.getByRole('link', { name: /View offer/ });
  await expect(ad).toHaveAttribute('href', sponsor.url);
  await expect(ad).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  assert.equal(paymentRequests, 0); assert.deepEqual(external, []);
  const sidebar = page.locator('.community-support-sidebar');
  const details = page.locator('section.community-funding');
  const supportButton = sidebar.getByRole('button', { name: 'Support Community', exact: true });
  await expect(page.getByRole('button', { name: 'Expand menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(supportButton).toBeVisible();
  await expect(sidebar.locator('.sidebar-support-copy')).toHaveText('Community is free. Your contribution helps fund its development, maintenance and services. Thank you for your support!');
  mkdirSync('test-results/community-funding', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(supportButton).toBeInViewport();
    const copyBox = await sidebar.locator('.sidebar-support-copy').boundingBox();
    assert.ok(copyBox.y + copyBox.height <= (await supportButton.boundingBox()).y, 'Support explanation stays above the button');
    await supportButton.focus();
    await expect(supportButton).toBeFocused();
    if (width > 780) assert.ok((await supportButton.boundingBox()).y > 350, 'Support stays at the bottom of the desktop sidebar');
    await page.screenshot({ path: `test-results/community-funding/sidebar-collapsed-${width}.png` });
    await page.getByRole('button', { name: 'Expand menu', exact: true }).click();
    await expect(supportButton).toBeInViewport();
    await page.getByRole('button', { name: 'Collapse menu', exact: true }).click();
  }
  const beforeNavigation = fundingRequests;
  for (const view of ['overview', 'agents', 'usage', 'features', 'configuration']) {
    await page.evaluate(v => { location.hash = v; }, view);
    await expect(page.locator('nav button.active')).toHaveAttribute('aria-label', { overview: 'Overview', agents: 'Agents', usage: 'Usage', features: 'Plan & data', configuration: 'Configuration' }[view]);
    const banner = page.locator('.community-sponsor-banner');
    await expect(banner).toHaveCount(1);
    await expect(banner).toContainText('E-commerce hosting');
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const banner = document.querySelector('.community-sponsor-banner').getBoundingClientRect();
      return Math.abs(banner.top - header.bottom);
    })).toBeLessThanOrEqual(1);

  }
  assert.equal(fundingRequests, beforeNavigation, 'Page changes use the current eligible list without unnecessary network requests');
  await page.evaluate(() => { location.hash = 'agents'; });
  await expect(page.locator('.agents-view')).toBeVisible();
  await expect(supportButton).toBeVisible();
  await supportButton.click();
  await expect(sidebar.getByRole('link', { name: 'Continue to Stripe ↗' })).toHaveAttribute('href', 'https://buy.stripe.com/test_fixture');
  assert.equal(paymentRequests, 1);
  await page.evaluate(() => { location.hash = 'features'; });
  await expect(details.getByRole('link', { name: 'Continue to Stripe ↗' })).toHaveAttribute('href', 'https://buy.stripe.com/test_fixture');
  assert.equal(fundingRequests, beforeNavigation, 'One funding state serves both placements and survives navigation');
  assert.equal(paymentRequests, 1, 'Changing view does not prepare another payment link');
  await page.evaluate(() => { location.hash = 'overview'; });
  rotate = true;
  await page.reload();
  await expect(page.locator('#community-sponsor-title')).toHaveText('Second campaign');
  for (const view of ['agents', 'usage', 'configuration', 'features', 'overview']) {
    const previous = await selected();
    await page.evaluate(v => { location.hash = v; }, view);
    await expect(page.locator('#community-sponsor-title')).not.toHaveText(previous);
  }
  const previousReload = await selected();
  await page.reload();
  await expect(page.locator('#community-sponsor-title')).not.toHaveText(previousReload);
  // Browser back/forward also rotates. Consecutive non-overview pages must work.
  await page.evaluate(() => { location.hash = 'agents'; });
  await expect(page.locator('nav button.active')).toHaveAttribute('aria-label', 'Agents');
  const previousBack = await selected();
  await page.goBack();
  await expect(page.locator('#community-sponsor-title')).not.toHaveText(previousBack);
  assert.equal(paymentRequests, 1, 'Rotation does not prepare payments');
  rotate = false;
  sponsor.image = image;
  await page.reload();
  const creative = page.getByRole('img', { name: 'Partner creative' });
  await creative.scrollIntoViewIfNeeded();
  await expect(creative).toHaveAttribute('src', /image\.webp$/);
  await expect(creative.locator('..')).toHaveAttribute('href', sponsor.url);
  await expect(creative.locator('..')).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(creative).toHaveAttribute('src', /poster\.webp$/);
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect(creative).toHaveAttribute('src', /image\.webp$/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(creative).toHaveAttribute('src', /poster\.webp$/);
  await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toHaveCount(0);
  mkdirSync('test-results/community-funding', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await creative.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/community-funding/sponsor-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  // Media failure cannot hide the sponsor text, CTA or operational controls.
  failImage = true; await page.reload();
  await page.locator('.community-funding').scrollIntoViewIfNeeded();
  await expect(page.getByRole('img', { name: 'Partner creative' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View offer/ })).toBeVisible();
  failImage = false; await page.reload();
  await page.getByRole('button', { name: 'Expand menu', exact: true }).click();
  await page.getByRole('button', { name: /Plan & data/ }).click();
  await expect(page.getByRole('heading', { name: 'Support NeuroCheckout Community' })).toBeVisible();
  await details.getByRole('button', { name: 'Support Community', exact: true }).click();
  await expect(details.getByRole('link', { name: 'Continue to Stripe ↗' })).toHaveAttribute('href', 'https://buy.stripe.com/test_fixture');
  assert.equal(paymentRequests, 2);
  await expect(sidebar.getByRole('link', { name: 'Continue to Stripe ↗' })).toBeVisible();

  // Refresh while upgrading: no reload or reinstall, no stale free fallback.
  plan = 'pro'; status = 'paid_active';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);
  const beforePaid = fundingRequests;
  await page.getByRole('button', { name: /Overview/ }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);
  assert.equal(fundingRequests, beforePaid);
  failCaps = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.cloud-status')).toHaveText('Cloud data stale');
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);
  failCaps = false;

  for (const paidPlan of ['starter', 'pro', 'enterprise']) {
    plan = paidPlan; status = 'trial_active'; await page.reload();
    await expect(page.locator('.cloud-status')).toHaveText('Account connected');
    await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);
    assert.equal(fundingRequests, beforePaid);
  }
  plan = 'community'; status = 'free_active'; failFunding = true; await page.reload();
  await expect(page.locator('.cloud-status')).toHaveText('Account connected');
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);
  failFunding = false; available = false; await page.reload();
  await expect(page.locator('.cloud-status')).toHaveText('Account connected');
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0);

  available = true; await page.reload();
  await expect(page.getByRole('heading', { name: 'E-commerce hosting' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand menu', exact: true }).click();
  await page.getByRole('button', { name: /Plan & data/ }).click(); wrongStripe = true;
  await details.getByRole('button', { name: 'Support Community', exact: true }).click();
  await expect(details.getByRole('alert').filter({ hasText: 'Support payments' })).toBeVisible();
  await expect(sidebar.getByRole('alert').filter({ hasText: 'Support payments' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to Stripe/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Soutenez NeuroCheckout Community' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Soutenir Community', exact: true })).toBeVisible();
  await expect(sidebar.locator('.sidebar-support-copy')).toContainText('Community est gratuit.');
  await expect(page.locator('.community-sponsor-banner')).toContainText('Hébergement e-commerce');
  mkdirSync('test-results/community-funding', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/community-funding/support-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  shortExpiry = true; await page.goto(origin); await page.reload();
  await expect(page.locator('.community-funding')).toBeVisible();
  await expect(page.locator('.community-funding, .community-support-sidebar')).toHaveCount(0, { timeout: 4000 });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: explained sidebar support, one header campaign across pages, collapsed/expanded menu, shared verified payment flow, sponsor images, pause/reduced motion, failed-media text fallback, free only, upgrades/trials/outage/expiry, sandbox support, no third-party requests, EN/FR, desktop/mobile.');
} finally {
  await browser?.close();
  if (server.exitCode === null) { const stopped = once(server, 'exit'); server.kill('SIGTERM'); await stopped; }
}
