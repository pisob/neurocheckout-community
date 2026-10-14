import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const origin='http://127.0.0.1:13439';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','13439'],{stdio:'ignore',env:{...process.env,NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false'}});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let failQuota=false, used=12, opens=10, wrongShop=false, conversions=0, failHistory=false;
  const shop={shop_uuid:'11111111-1111-4111-8111-111111111111',shop_id:'fixture',platform:'prestashop'};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let body={},status=200;
    if(path.endsWith('/capabilities')){
      status=failQuota?503:200;
      body=failQuota?{detail:'PRIVATE_DO_NOT_SHOW'}:{schema_version:'1.1',manifest:{authority:'neurocheckout_cloud',deny_by_default:true,refresh_after_seconds:60},plan:{code:'community',edition:'community'},subscription:{status:'free_active',active:true},limits:{shops:2,active_agents:8,emails:{limit:100,used,remaining:100-used,window:'rolling_24h',window_hours:24}},features:{member_dashboard:true,agent_performance:true,converted_orders:true,recent_emails:true},agents:{available:[]},connectors:[],dashboard:{},upgrade:{available:false,target_plans:[]}};
    } else if(path.endsWith('/shops'))body={items:[shop]};
    else if(path.endsWith('/agent-performance'))body={shop:wrongShop?{...shop,shop_uuid:'22222222-2222-4222-8222-222222222222'}:shop,period:{days:30},summary:{open_rate:opens,click_rate:5,orders_attributed:1},items:[]};
    else if(path.endsWith('/converted-orders'))body={shop,items:[],count:0};
    else if(path.endsWith('/recent-emails')){
      status=failHistory?503:200;
      body={shop,items:[],count:0,limit:10,offset:0,total:conversions,status_counts:{sent:0,delivered:0,opened:0,clicked:0,converted:conversions,bounced:0}};
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(origin+'/#usage');
  await expect(page.locator('.usage-number strong')).toHaveText('12');
  failQuota=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.usage-number strong')).toHaveText('—');
  await expect(page.locator('.cloud-status')).toHaveText('Cloud data stale');
  assert(!(await page.locator('body').innerText()).includes('PRIVATE_DO_NOT_SHOW'));
  failQuota=false;used=15;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.usage-number strong')).toHaveText('15');
  await page.goto(origin+'/#agent-performance');await page.reload();
  const rates=page.locator('.performance-view .analytics-summary strong');
  await expect(rates.nth(2)).toHaveText('10%');
  opens=25;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(rates.nth(2)).toHaveText('25%');
  wrongShop=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('.performance-view [role="alert"]')).toBeVisible();
  await expect(page.locator('.performance-view .analytics-summary')).toHaveCount(0);
  await page.goto(origin+'/#converted-orders');await page.reload();
  const converted=page.locator('.email-status-filters button').filter({hasText:'Converted'}).locator('span');
  await expect(converted).toHaveText('0');
  conversions=1;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(converted).toHaveText('1');
  failHistory=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(converted).toHaveText('—');
  failHistory=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(converted).toHaveText('1');
  failQuota=true;await page.reload();
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  failQuota=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('.cloud-status')).toHaveText('Account connected');
  assert.deepEqual(errors,[]);
  console.log('PASS: unavailable quota is not zero, recovery refreshes usage, analytics refresh automatically and reject other-store data.');
} finally {
  await browser?.close();
  if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}
