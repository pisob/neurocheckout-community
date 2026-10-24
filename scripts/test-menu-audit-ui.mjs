import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.NC_PLAYWRIGHT_MODULE || '@playwright/test');
const origin = 'http://127.0.0.1:13429';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '13429'], {
  stdio: 'ignore', env: { ...process.env, NC_DEPLOYMENT_ENV: 'test', NC_LOCAL_DATA_PILOT_ENABLED: 'false', NC_CONNECTOR_PULL_ENABLED: 'false', NC_COMMUNITY_AVAILABILITY_ENABLED: 'false' },
});
const shop = { shop_uuid: '11111111-1111-4111-8111-111111111111', shop_id: 'audit-fixture', platform: 'prestashop' };
const caps = {
  schema_version: '1.1', manifest: { authority: 'neurocheckout_cloud', deny_by_default: true },
  plan: { code: 'pro', edition: 'community' }, subscription: { status: 'paid_active', active: true },
  limits: { shops: 4, active_agents: 8, emails: { limit: 1000, used: 15, remaining: 985, scope: 'shop', shop_id: shop.shop_id, shop_uuid: shop.shop_uuid, window: 'rolling_24h', window_hours: 24 } },
  features: { member_dashboard: true, agent_performance: true, converted_orders: true, recent_emails: true, email_approvals: true, member_messages: true, journey_audit: true, sync_health: true },
  agents: { available: [], coordination_enabled: false }, connectors: [],
  dashboard: { current_version: '0.1.0-preview.36', latest_version: '0.1.0-preview.36' }, upgrade: { available: false, target_plans: [] },
};
const approval = (i, status) => ({ id: `fixture-${i}`, shop_id: shop.shop_id, recipient_email: 'fixture@example.invalid', subject: `AUDIT ${status} ${i}`, status, body_text: 'Synthetic test record' });
let browser;
async function scenario(name, override, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [], mutations = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (req.method() !== 'GET') mutations.push(url.pathname);
    let body = {};
    if (url.pathname.endsWith('/capabilities')) body = caps;
    else if (url.pathname.endsWith('/shops')) body = { items: [shop] };
    else if (url.pathname.endsWith('/setup')) body = { available: false, configured: false };
    else if (url.pathname.endsWith('/converted-orders')) body = { shop, items: [], count: 0 };
    else if (url.pathname.endsWith('/recent-emails')) body = { shop, items: [], count: 0, total: 0, status_counts: {} };
    else if (url.pathname === '/api/cloud/sync-health') body = { shop, state: 'synchronizing', online: true, queue: {}, data_quality: {}, evidence: {} };
    else if (url.pathname.endsWith('/email-approvals')) body = { items: [], total: 0, offset: 0 };
    const custom = await override(url, req);
    await route.fulfill({ status: custom?.status ?? 200, contentType: 'application/json', body: JSON.stringify(custom?.body ?? body) });
  });
  try {
    const allowedMutations = await run(page) ?? [];
    assert.deepEqual(errors, [], `${name}: no browser exception`);
    assert.deepEqual(mutations, allowedMutations, `${name}: only explicitly tested mock mutations`);
    assert.deepEqual(external, [], `${name}: no external requests`);
    console.log(`PASS: ${name}`);
  } finally { await context.close(); }
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  await scenario('long cart and order references remain readable inside the conversion panel', async u => {
    if (!u.pathname.endsWith('/converted-orders')) return null;
    return { body: { shop, count: 1, items: [{ order_id: 'order-' + 'a'.repeat(150),
      cart_id: 'wc-cart-' + 'b'.repeat(250), order_total: 35, customer: {}, recorded_order_status: 'on-hold', order_status_recorded_at: '2026-10-15T12:00:00Z',
      converted_at: '2026-10-15T12:00:00Z', attribution_agent_name: 'abandoned_cart', influence_agent_names: [] }] } };
  }, async p => {
    await p.goto(origin + '/#converted-orders');
    await p.locator('.conversion-inspector dd').first().waitFor();
    await expect(p.locator('.conversion-inspector')).toContainText('not verified payment');
    await expect(p.locator('.conversion-inspector')).toContainText('Cancellation and refund tracking are not available');
    await expect(p.locator('.conversion-inspector')).toContainText('Recorded order status');
    await expect(p.locator('.conversion-inspector')).toContainText('on-hold');
    for (const width of [1440, 820, 390]) {
      await p.setViewportSize({ width, height: 1000 });
      await expect(p.locator('.conversion-inspector')).toBeVisible();
      assert(await p.locator('.conversion-inspector').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `panel does not overflow at ${width}px`);
      await expect(p.locator('.conversion-inspector dd').nth(1)).toHaveText('wc-cart-' + 'b'.repeat(250));
    }
  });
  await scenario('hash links, browser history and prototype-safe view names', async u => u.pathname.endsWith('/recent-emails') ? { status: 503 } : null, async p => {
    await p.goto(origin + '/#converted-orders');
    await p.getByRole('link', { name: 'Check synchronization', exact: true }).click();
    await p.locator('.sync-health-view').waitFor();
    assert.match(await p.locator('nav button.active').innerText(), /Sync health/);
    await p.getByRole('button', { name: /Orders & emails/ }).click();
    await expect(p.locator('nav button.active')).toContainText('Orders & emails');
    await expect(p).toHaveURL(/#converted-orders$/);
    await p.goBack();
    await p.locator('.sync-health-view').waitFor();
    await p.evaluate(() => { location.hash = 'constructor'; });
    await p.waitForFunction(() => document.querySelector('nav button.active')?.textContent?.includes('Overview'));
  });
  for (const [name, response] of [['unavailable', { status: 503 }], ['malformed', { body: { items: {} } }]]) {
    await scenario(`approvals ${name} is not an empty queue`, async u => u.pathname.endsWith('/email-approvals') ? response : null, async p => {
      await p.goto(origin + '/#email-approvals');
      await p.locator('.approvals-view [role=alert]').waitFor();
      assert.equal(await p.getByText('No email requires action', { exact: true }).count(), 0);
      assert.equal(await p.getByRole('button', { name: 'Approve & send', exact: true }).count(), 0);
    });
  }
  let pendingRequested = false;
  const secondShop = { shop_uuid: '22222222-2222-4222-8222-222222222222', shop_id: 'second-fixture', platform: 'woocommerce' };
  await scenario('local approvals select the store and send only the reviewed signature', async (u, req) => {
    if (u.pathname.endsWith('/shops')) return { body: { items: [shop, secondShop] } };
    if (u.pathname.endsWith('/email-approvals')) {
      const selected = u.searchParams.get('shop_uuid') === secondShop.shop_uuid ? secondShop : shop;
      return { body: { items: [{ ...approval(41, 'pending'), shop_id: selected.shop_id, shop_uuid: selected.shop_uuid,
        subject: 'Review ' + selected.shop_id, content_location: 'community_local', preview_available: true,
        community_copy_signature: (selected === secondShop ? 'b' : 'a').repeat(64), body_html: '<p>Original reviewed copy ' + selected.shop_id + '</p><img src="https://invalid.example/open.gif"><script>parent.alert(1)</script>' }], total: 1, offset: 0 } };
    }
    if (u.pathname.endsWith('/approve')) {
      assert.equal(u.searchParams.get('shop_uuid'), secondShop.shop_uuid);
      assert.deepEqual(req.postDataJSON(), { copy_signature: 'b'.repeat(64) });
      return { body: { ok: true, delivery: { queued: true } } };
    }
    return null;
  }, async p => {
    await p.addInitScript(() => {
      window.__ncEmptyApprovalFrames = 0;
      new MutationObserver(mutations => {
        for (const mutation of mutations) for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const frames = node.matches('.email-document iframe') ? [node] : [...node.querySelectorAll('.email-document iframe')];
          for (const frame of frames) if (!frame.getAttribute('srcdoc')) window.__ncEmptyApprovalFrames++;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await p.goto(origin + '/#email-approvals');
    await p.getByRole('heading', { name: 'Review ' + shop.shop_id, exact: true }).waitFor();
    await p.getByLabel('Store', { exact: true }).selectOption(secondShop.shop_uuid);
    await p.getByRole('heading', { name: 'Review ' + secondShop.shop_id, exact: true }).waitFor();
    await expect(p.frameLocator('.approval-preview iframe').locator('body')).toContainText('Original reviewed copy ' + secondShop.shop_id);
    assert.equal(await p.frameLocator('.approval-preview iframe').locator('script,img[src]').count(), 0);
    assert.equal(await p.evaluate(() => window.__ncEmptyApprovalFrames), 0, 'Never mount a blank iframe before the sanitized copy is ready');
    await expect(p.getByRole('button', { name: 'Approve and send', exact: true })).toBeEnabled();
    p.once('dialog', dialog => dialog.accept());
    await p.getByRole('button', { name: 'Approve and send', exact: true }).click();
    await p.getByText('Email approved and handed to Cloud delivery.', { exact: true }).waitFor();
    return ['/api/cloud/email-approvals/fixture-41/approve'];
  });
  await scenario('missing local original cannot be approved', async u => u.pathname.endsWith('/email-approvals') ? { body: {
    items: [{ ...approval(42,'pending'), shop_uuid: shop.shop_uuid, content_location: 'community_local',
      preview_available: false, subject: '', recipient_email: '', body_text: '' }], total: 1, offset: 0,
  } } : null, async p => {
    await p.goto(origin + '/#email-approvals');
    await p.getByRole('heading', { name: 'Local preview unavailable', exact: true }).waitFor();
    await expect(p.getByRole('button', { name: 'Approve and send', exact: true })).toBeDisabled();
    await expect(p.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
  });
  await scenario('approvals without stores never query an unspecified store', async u => {
    if (u.pathname.endsWith('/shops')) return { body: { items: [] } };
    assert(!u.pathname.endsWith('/email-approvals'));
    return null;
  }, async p => {
    await p.goto(origin + '/#email-approvals');
    await p.getByRole('heading', { name: 'Connect a store to review emails', exact: true }).waitFor();
  });
  await scenario('in-flight sends are visible in All and cannot be sent twice', async u => u.pathname.endsWith('/email-approvals') && u.searchParams.get('status') === 'all' ? { body: { items: [approval(1, 'sending')], total: 1, offset: 0 } } : null, async p => {
    await p.goto(origin + '/#email-approvals');
    await p.getByRole('button', { name: 'All', exact: true }).click();
    await p.getByRole('heading', { name: 'AUDIT sending 1', exact: true }).waitFor();
    assert.equal(await p.locator('.approval-actions').count(), 0);
    assert.equal(await p.locator('.approvals-view [role=alert]').count(), 0);
  });
  await scenario('late approval responses cannot replace the selected filter', async u => {
    if (!u.pathname.endsWith('/email-approvals')) return null;
    const status = u.searchParams.get('status');
    if (status === 'pending') pendingRequested = true;
    await new Promise(resolve => setTimeout(resolve, status === 'pending' ? 1200 : 20));
    return { body: { items: [approval(1, status)], total: 1, offset: 0 } };
  }, async p => {
    await p.goto(origin + '/#email-approvals');
    await p.locator('.approvals-view').waitFor();
    while (!pendingRequested) await p.waitForTimeout(20);
    await p.getByRole('button', { name: 'Sent', exact: true }).click();
    await p.getByRole('heading', { name: 'AUDIT sent 1', exact: true }).waitFor();
    await p.waitForTimeout(1500);
    assert.equal(await p.locator('.approval-preview h2').innerText(), 'AUDIT sent 1');
  });
  await scenario('no stores produces an actionable empty state, not a spinner', async u => u.pathname.endsWith('/shops') ? { body: { items: [] } } : null, async p => {
    await p.goto(origin + '/#sync-health');
    await p.getByRole('heading', { name: 'Connect a store to check synchronization', exact: true }).waitFor();
    assert.equal(await p.getByText('Checking the full synchronization path…', { exact: true }).count(), 0);
    await p.getByRole('link', { name: 'Open configuration', exact: true }).click();
    await p.getByRole('tab', { name: 'Store', exact: true }).waitFor();
  });
  const queries = [];
  await scenario('approval history paginates and resets on filter changes', async u => {
    if (!u.pathname.endsWith('/email-approvals')) return null;
    const status = u.searchParams.get('status'), offset = Number(u.searchParams.get('offset'));
    queries.push({ status, offset });
    return { body: { total: 51, limit: 50, offset, items: Array.from({ length: offset ? 1 : 50 }, (_, i) => approval(offset + i + 1, status)) } };
  }, async p => {
    await p.goto(origin + '/#email-approvals');
    await p.locator('.approval-list button').first().waitFor();
    await p.getByRole('button', { name: 'Sent', exact: true }).click();
    await p.getByRole('heading', { name: 'AUDIT sent 1', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('heading', { name: 'AUDIT sent 51', exact: true }).waitFor();
    assert.equal(await p.locator('.approval-list button').count(), 1);
    assert(await p.getByRole('button', { name: 'Next', exact: true }).isDisabled());
    await p.getByRole('button', { name: 'Pending', exact: true }).click();
    await p.getByRole('heading', { name: 'AUDIT pending 1', exact: true }).waitFor();
    assert(queries.some(q => q.status === 'sent' && q.offset === 50));
    assert.deepEqual(queries.at(-1), { status: 'pending', offset: 0 });
  });
  await scenario('shop quota displays its authoritative store identity', async () => null, async p => {
    await p.goto(origin + '/#usage');
    await p.getByText(`Store: ${shop.shop_id}`, { exact: true }).waitFor();
  });
  let messageRevision = 1, notificationReads = 0, readPending = false;
  await scenario('messages refresh on reconnect without racing read acknowledgements', async u => {
    if (u.pathname === '/api/cloud/notifications') {
      notificationReads++;
      return { body: { items: [{ id: 'message-1', title: `Notice ${messageRevision}`, preview: 'Fixture', body: 'Fixture body', createdAt: '2026-10-15T12:00:00Z', unread: true }] } };
    }
    if (u.pathname === '/api/cloud/notifications/message-1/read') {
      readPending = true;
      await new Promise(resolve => setTimeout(resolve, 500));
      return { body: { id: 'message-1', unread: false } };
    }
  }, async p => {
    await p.goto(origin + '/#messages');
    await p.getByRole('heading', { name: 'Notice 1', exact: true }).waitFor();
    messageRevision = 2;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await p.getByRole('heading', { name: 'Notice 2', exact: true }).waitFor();
    await p.locator('.message-list button').filter({ hasText: 'Notice 2' }).click();
    while (!readPending) await p.waitForTimeout(20);
    const before = notificationReads;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await p.waitForTimeout(650);
    assert.equal(notificationReads, before, 'Do not load stale unread evidence during an acknowledgement');
    assert.equal(await p.locator('.message-list button').filter({ hasText: 'Notice 2' }).locator('i.unread').count(), 0);
    return ['/api/cloud/notifications/message-1/read'];
  });
  for (const malformed of [true, false]) {
    await scenario(`journey audit rejects ${malformed ? 'malformed' : 'other-store'} evidence`, async u => u.pathname.endsWith('/journey-audit') ? { body: malformed ? {} : {
      shop: { ...shop, shop_uuid: '22222222-2222-4222-8222-222222222222' }, period_days: 30, audit_count: 0, state: 'idle', event_summary: {}, recent_sessions: [], recent_audits: [],
    } } : null, async p => {
      await p.goto(origin + '/#journey-audit');
      await p.locator('.journey-view [role=alert]').waitFor();
      assert.equal(await p.locator('.journey-summary').count(), 0);
    });
  }
  let journeyEvents = 3;
  await scenario('journey evidence refreshes automatically after reconnect', async u => u.pathname.endsWith('/journey-audit') ? { body: {
    shop, period_days: 30, audit_count: 0, state: 'observed', event_summary: { total_events: journeyEvents }, recent_sessions: [], recent_audits: [],
  } } : null, async p => {
    await p.goto(origin + '/#journey-audit');
    const events = p.locator('.journey-summary > div').filter({ hasText: 'Journey events' }).locator('strong');
    await events.getByText('3', { exact: true }).waitFor();
    journeyEvents = 4;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await events.getByText('4', { exact: true }).waitFor();
  });
  let freshSource = true;
  await scenario('setup requires fresh local evidence, even when Cloud says healthy', async u => {
    if (u.pathname === '/api/cloud/sync-health') return { body: { state: 'healthy', online: true, queue: { pending: 0, processing: 0, retrying: 0, failed: 0 }, data_quality: { incomplete: 0 }, evidence: { received: 1, sent: 1, converted: 0 } } };
    if (u.pathname === '/api/local-data/sync-health') return { body: { available: true, configured: true, ready: true, shop_id: shop.shop_id, source: { diagnostic: { code: 'ok', checked_at: Date.now() }, last_complete_at: freshSource ? Date.now() : 1 } } };
  }, async p => {
    await p.goto(origin);
    const checklist = p.locator('.setup-checklist');
    await p.waitForFunction(() => document.querySelector('.setup-checklist')?.getAttribute('aria-busy') === 'false');
    await expect(checklist.locator('li > div > span').filter({ hasText: /^Done$/ })).toHaveCount(4);
    freshSource = false;
    await checklist.getByRole('button', { name: 'Check again', exact: true }).click();
    // The click can return before React has committed busy=true. Waiting only
    // for busy=false may read the previous successful render; await the new
    // semantic result without weakening the stale-source readiness assertion.
    await expect(checklist.locator('li > div > span').filter({ hasText: /^Done$/ })).toHaveCount(2);
    await expect(checklist).toHaveAttribute('aria-busy', 'false');
  });
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
