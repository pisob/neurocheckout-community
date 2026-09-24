import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NC_PLAYWRIGHT_MODULE || '@playwright/test');
const port=Number(process.env.NC_TEST_PORT || 13401), origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false'},
});
let browser;
try {
 for(let i=0;i<80;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[],outbound=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=route.request().url();if(!url.startsWith(origin)){outbound.push(url);return route.abort();}return route.continue();});
 const shop={shop_uuid:'11111111-1111-4111-8111-111111111111',shop_id:'synthetic-shop',platform:'prestashop',currency_code:'USD'};
 const items=[{delivery_id:'community-edge-1',subject:'Your selection is saved',recipient_email:'synthetic@example.invalid',customer:{},sent_at:new Date().toISOString(),agent_name:'abandoned_cart',status:'sent',tracking_available:false,preview_available:true,
 body_html:`<html><head><meta http-equiv="refresh" content="0;url=https://tracking.invalid/refresh"><style>@import url('https://tracking.invalid/style');.banner{background:#142c40;color:white;padding:22px}</style></head><body><div class="banner"><h1>Your selection is saved</h1></div><p>Your items are waiting for you.</p><table><tr><td>Framed poster × 3</td><td>$104.40</td></tr><tr><td>Mug × 3</td><td>$42.84</td></tr></table><p><b>Total: $147.24</b></p><a href="https://tracking.invalid/click">Return to my cart</a><img src="https://tracking.invalid/pixel" onerror="alert(1)"><svg onload="alert(1)"></svg><iframe src="https://tracking.invalid/frame"></iframe><script>alert(1)</script></body></html>`},
 {delivery_id:'community-edge-2',subject:'Older message',customer:{email_masked:'s***@example.invalid'},sent_at:new Date().toISOString(),status:'sent',preview_available:false}];
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let body={};
  if(path.endsWith('/capabilities'))body={schema_version:'1.0',plan:{code:'community',edition:'community'},subscription:{status:'free_active',active:true},limits:{shops:1,active_agents:8,emails:{limit:100,used:2,remaining:98}},features:{member_dashboard:true,converted_orders:true,recent_emails:true},agents:{available:[],coordination_enabled:true},dashboard:{update_required:false,update_recommended:false},upgrade:{available:false},connectors:[]};
  else if(path.endsWith('/shops'))body={items:[shop]};
  else if(path.endsWith('/converted-orders'))body={shop,items:[],count:0};
  else if(path.endsWith('/recent-emails'))body={shop,items,count:2,limit:10};
  else if(path.endsWith('/setup'))body={enabled:true,configured:true,source_pull_configured:true};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(origin+'/?connected=1#converted-orders');
 await page.locator('.sent-email-inspector iframe').waitFor();
  await page.frameLocator('.sent-email-inspector iframe').getByText('Total: $147.24').waitFor();
  const recovery = page.getByRole('link', {name: 'Open original cart link'});
  assert.equal(await recovery.getAttribute('href'), 'https://tracking.invalid/click');
  assert.equal(await recovery.getAttribute('target'), '_blank');
  assert.equal(await recovery.getAttribute('rel'), 'noopener noreferrer');
 assert.equal(await page.frameLocator('.sent-email-inspector iframe').locator('script,iframe,meta[http-equiv="refresh"],a[href],img[src^="http"]').count(),0);
 await page.getByRole('button',{name:'Full preview',exact:true}).click();
 assert.equal(await page.locator('dialog[open]').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.getByRole('button',{name:'Full preview',exact:true}).evaluate(el=>el===document.activeElement),true);
 if(process.env.NC_TEST_SCREENSHOT){
  await page.locator('.sent-email-inspector iframe').scrollIntoViewIfNeeded();
  await page.frameLocator('.sent-email-inspector iframe').getByText('Total: $147.24').waitFor({state:'visible'});
  await page.waitForTimeout(150);
  await page.locator('.email-activity').screenshot({path:process.env.NC_TEST_SCREENSHOT});
 }
 await page.getByRole('button',{name:/Older message/}).click();
  await page.locator('.sent-email-inspector').getByText('The original content is unavailable in this installation.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link', {name: 'Open original cart link'}).count(), 0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.getByRole('button',{name:/Your selection is saved/}).click();
 await page.frameLocator('.sent-email-inspector iframe').getByText('Total: $147.24').waitFor();
 await page.waitForTimeout(300);
 assert.deepEqual(outbound,[]);assert.deepEqual(errors,[]);
 // Exercise real tab changes with intentionally reordered server replies.
 const statuses = ['sent', 'delivered', 'opened', 'clicked', 'converted', 'bounced'];
 const history = statuses.map((status, index) => ({ ...items[0], delivery_id: `community-edge-${100+index}`,
   subject: `Message ${status}`, status, body_html: `<p>Content ${status}</p>`, tracking_available: true }));
 let releaseSlow, startedSlow;
 const slowStarted = new Promise(resolve => { startedSlow = resolve; });
 const slowGate = new Promise(resolve => { releaseSlow = resolve; });
 let slowOnce = true;
 await page.route('**/api/cloud/recent-emails?*', async route => {
   const query = new URL(route.request().url()).searchParams;
   const status = query.get('status');
   if (status === 'sent' && slowOnce) { slowOnce = false; startedSlow(); await slowGate; }
   const filtered = status === 'all' ? history : history.filter(item => item.status === status);
   await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ shop, items: filtered,
     count: filtered.length, total: filtered.length, limit: 10, offset: 0, has_more: false,
     status_counts: Object.fromEntries(statuses.map(status => [status, 1])) }) });
 });
 await page.setViewportSize({width:1440,height:1100});
 const tab = name => page.locator('.email-status-filters button').filter({ hasText: new RegExp(`^${name}\\s*\\d*$`) });
 await tab('Sent').click();
 await slowStarted;
 await tab('Converted').click();
 await page.locator('.sent-email-inspector h3').filter({hasText:'Message converted'}).waitFor();
 releaseSlow();
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.sent-email-inspector h3').innerText(), 'Message converted');
 for (const status of statuses) {
   await tab(status[0].toUpperCase()+status.slice(1)).click();
   await page.locator('.sent-email-inspector h3').filter({hasText:`Message ${status}`}).waitFor();
   assert.equal(await page.locator('.sent-email-list button').count(), 1);
   await page.frameLocator('.sent-email-inspector iframe').getByText(`Content ${status}`, {exact:true}).waitFor();
 }
 await tab('All').click();
 await page.getByRole('button', {name:/Message clicked/}).click();
 await page.frameLocator('.sent-email-inspector iframe').getByText('Content clicked', {exact:true}).waitFor();
 assert.deepEqual(errors, []);
 console.log('Exclusive status tabs, delayed response rejection and preview identity passed.');
 console.log('Desktop/mobile, original preview, missing-copy state, modal keyboard and zero external requests passed.');
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}
