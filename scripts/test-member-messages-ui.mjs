import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';

const origin='http://127.0.0.1:13447',state=await mkdtemp(join(tmpdir(),'nc-message-test-'));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','13447'],{
 stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',
 NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false',NC_COMMUNITY_STATE_DIRECTORY:state}});
const shops=[{shop_uuid:'11111111-1111-4111-8111-111111111111',shop_id:'store-one'},
 {shop_uuid:'22222222-2222-4222-8222-222222222222',shop_id:'store-two'}];
const caps={schema_version:'1.1',manifest:{authority:'neurocheckout_cloud',deny_by_default:true},
 plan:{code:'pro',edition:'community'},subscription:{status:'paid_active',active:true},
 limits:{shops:4,active_agents:8,emails:{limit:1000,used:0,remaining:1000}},
 features:{member_dashboard:true,member_messages:true,agent_performance:true},agents:{available:[]},connectors:[],dashboard:{},upgrade:{available:false,target_plans:[]}};
const item=lang=>({id:'00000000-0000-4000-8000-000000000001',kind:'business_alert_incident:notice',
 title:lang==='fr'?'Performance des e-mails':'Email performance',preview:lang==='fr'?'Consultez vos résultats.':'Review your results.',
 body:lang==='fr'?'Consultez les performances de votre boutique.':'Review your store performance.',unread:true,
 createdAt:'2026-10-30T10:00:00Z',shop_id:'store-two',upgrade_href:'/dashboard/overview?agent=business-alerts#agent-kpis',upgrade_label:lang==='fr'?'Consulter les alertes':'Review alerts'});
let browser;
try {
 let ready=false;
 for(let n=0;n<100;n++) {try {if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 assert(ready,'Test server did not start');browser=await chromium.launch();
 for(const language of ['fr','en']) {
  const context=await browser.newContext(),page=await context.newPage(),requests=[],errors=[];
  await context.addInitScript(lang=>localStorage.setItem('neurocheckout-community-ui-language',lang),language);
  page.on('pageerror',e=>errors.push(e.message));
  let releaseRead=null,readStarted=false,delayRead=false;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   requests.push({path:url.pathname,search:url.search,method:req.method()});let body={};
   if(url.pathname.endsWith('/capabilities'))body=caps;
   else if(url.pathname.endsWith('/shops'))body={items:shops};
   else if(url.pathname==='/api/cloud/notifications')body={items:[item(url.searchParams.get('locale')||'en')]};
   else if(url.pathname.endsWith('/read')) {
    readStarted=true;if(delayRead)await new Promise(resolve=>{releaseRead=resolve;});
    body={...item('en'),unread:false}; // A stale translation must never replace the displayed copy.
   }else if(url.pathname.endsWith('/agent-performance')){
    const shop=shops.find(s=>s.shop_uuid===url.searchParams.get('shop_uuid'));
    body={shop,period:{days:30},summary:{},items:[{agent_name:'abandoned_cart',mode:'conversion'},{agent_name:'business_alerts_anomalies',mode:'pilotage'}]};
   }else if(url.pathname.endsWith('/optimization-recommendations'))body={items:[]};
   await route.fulfill({json:body});
  });
  await page.goto(origin+'/?connected=1#messages');
  await expect(page.locator('.message-detail h2')).toHaveText(item(language).title);
  await page.locator('.message-list button').filter({hasText:item(language).title}).click();
  await expect.poll(()=>requests.some(r=>r.path.endsWith('/read'))).toBe(true);
  assert.equal(new URLSearchParams(requests.find(r=>r.path.endsWith('/read')).search).get('locale'),language);
  await expect(page.locator('.message-detail h2')).toHaveText(item(language).title);
  await page.locator('.message-detail a').click();
  await expect(page).toHaveURL(/#agent-performance$/);
  await expect(page.locator('.agent-performance-list button.active')).toContainText(language==='fr'?'Alertes business':'Business alerts');
  const performance=requests.filter(r=>r.path.endsWith('/agent-performance'));
  assert(performance.length>0);assert(performance.every(r=>new URLSearchParams(r.search).get('shop_uuid')===shops[1].shop_uuid));
  // A language switch while acknowledgment is in flight loads the new language.
  await page.goto(origin+'/#messages');
  await expect(page.locator('.message-detail h2')).toHaveText(item(language).title);
  delayRead=true;readStarted=false;
  await page.locator('.message-list button').filter({hasText:item(language).title}).click();
  await expect.poll(()=>readStarted&&Boolean(releaseRead)).toBe(true);
  const next=language==='fr'?'en':'fr';await page.getByRole('button',{name:next.toUpperCase(),exact:true}).click();
  releaseRead();await expect(page.locator('.message-detail h2')).toHaveText(item(next).title);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS ${language}: localized acknowledgment, store/agent destination, language switch during read.`);
 }
}finally {await browser?.close();const exited=once(server,'exit');server.kill('SIGTERM');await exited;await rm(state,{recursive:true,force:true});}
