import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require(process.env.NC_PLAYWRIGHT_MODULE || '@playwright/test');
const origin = 'http://127.0.0.1:13439';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '13439'], {
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
function payload() {
  return {shop, period_days:30, audit_count:0,state:'collecting_events',
    event_summary:{total_events:1,resolved_revenue:null,resolved_revenue_by_currency:[]},
    recent_sessions:[{session_key:'synthetic-session',estimated_cart_value:null,currency_code:null,
      lifecycle_state:'checkout_abandoned_signal',event_count:1,
      priority:{level:'high',score:80,reasons:['checkout_started_without_order']},
      action_status:{state:'recommended',delivery_state:'not_requested'}}],recent_audits:[],
    journey_pagination:{page:1,total_pages:1,total_items:1,is_truncated:true,candidate_limit:250}};
}
try {
  let ready=false;
  for (let i=0;i<100;i++) {
    try {if((await fetch(origin)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'local Community server ready');
  browser=await chromium.launch();
  await scenario('foreign shop evidence rejected',async u=>u.pathname.endsWith('/journey-audit')?{body:{...payload(),shop:{shop_uuid:'22222222-2222-4222-8222-222222222222'}}}:null,async p=>{
    await p.goto(origin+'/#journey-audit');
    await p.locator('.journey-view [role=alert]').waitFor();
    assert.equal(await p.locator('.journey-summary').count(),0);
  });
  await scenario('unknown amounts and partial coverage',async u=>u.pathname.endsWith('/journey-audit')?{body:payload()}:null,async p=>{
    await p.goto(origin+'/#journey-audit');
    await p.locator('.journey-inspector').waitFor();
    const revenue=await p.locator('.journey-revenue strong').innerText();
    const cart=await p.locator('.journey-inspector dl div').filter({hasText:'Cart value'}).locator('dd').innerText();
    const text=await p.locator('.journey-view').innerText();
    assert.equal(revenue, '—');
    assert.equal(cart, '—');
    assert.match(text,/partial journey history/i);
    assert.ok(!text.includes('checkout_started_without_order'));
  });
  let shrunk=false;
  await scenario('pagination follows server clamp',async u=>{
    if(!u.pathname.endsWith('/journey-audit'))return null;
    const body=payload();
    if(u.searchParams.get('session_page')==='2')shrunk=true;
    if(!shrunk)body.journey_pagination={page:1,total_pages:3,total_items:21};
    return {body};
  },async p=>{
    await p.goto(origin+'/#journey-audit');
    await p.locator('.journey-pagination').getByRole('button',{name:'Next'}).click();
    await p.waitForFunction(()=>document.querySelector('.journey-pagination span')?.textContent==='1 / 1');
    const page=await p.locator('.journey-pagination span').innerText();
    assert.equal(page,'1 / 1');
    assert.ok(await p.locator('.journey-pagination').getByRole('button',{name:'Next'}).isDisabled());
  });
  await scenario('French evidence and unavailable counters',async u=>{
    if(!u.pathname.endsWith('/journey-audit'))return null;
    const body=payload();body.audit_count=null;body.state='partial_data';
    body.data_quality={available:false,partial_history:true,native_history:'not_loaded'};
    body.recent_audits=[{id:'a',journey_summary:{summary_text:'INTERNAL ENGLISH COPY',lifecycle_state:'checkout_in_progress'},revenue_leaks:[{leak_type:'checkout_latency',summary:'INTERNAL DETAILS'}],recommended_actions:[{action_code:'review_customer_journey_audit',next_step:'INTERNAL ACTION'}]}];
    return {body};
  },async p=>{
    await p.addInitScript(()=>localStorage.setItem('neurocheckout-community-ui-language','fr'));
    await p.goto(origin+'/#journey-audit');
    await p.locator('.journey-audits').waitFor();
    const text=await p.locator('.journey-view').innerText();
    assert.match(text,/temporairement indisponibles/);
    assert.match(text,/Lenteur du paiement observée/);
    assert.match(text,/Examiner les éléments de ce parcours/);
    assert.doesNotMatch(text,/INTERNAL|checkout_started_without_order/);
    assert.equal(await p.locator('.journey-summary > div').first().locator('strong').innerText(),'—');
  });
} finally {
  await browser?.close();
  if(server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}
}
