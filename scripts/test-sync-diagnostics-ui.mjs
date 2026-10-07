import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const origin='http://127.0.0.1:13435';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','13435'],{stdio:'ignore',env:{...process.env,NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false'}});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  const page=await browser.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let mode='healthy';
  const shop={shop_uuid:'11111111-1111-4111-8111-111111111111',shop_id:'fixture',platform:'magento'};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname; let body={},status=200;
    if(path.endsWith('/capabilities'))body={schema_version:'1.1',manifest:{authority:'neurocheckout_cloud',deny_by_default:true},plan:{code:'community',edition:'community'},subscription:{status:'free_active',active:true},limits:{shops:1,active_agents:8,emails:{limit:100,used:0,remaining:100}},features:{member_dashboard:true,sync_health:true},agents:{available:[],coordination_enabled:true},dashboard:{current_version:'0.1.0-preview.29'},connectors:[],upgrade:{available:false,target_plans:[]}};
    else if(path.endsWith('/shops'))body={items:[shop]};
    else if(path==='/api/cloud/sync-health') {
      status=mode==='unavailable'?503:200;
      body=status===503?{detail:'PRIVATE_RAW_ERROR_DO_NOT_SHOW'}:{state:'healthy',online:mode!=='offline',queue:{pending:0,processing:0,retrying:0,failed:0},data_quality:{incomplete:0},evidence:{received:1,sent:0,converted:0}};
    } else if(path==='/api/local-data/sync-health')body={available:true,configured:true,ready:true,shop_id:'fixture',source:{diagnostic:{code:mode==='refused'?'source_auth_rejected':'ok',checked_at:mode==='stale'?1:Date.now()}}};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  for(const [next,code] of [['healthy','source_verified'],['refused','source_auth_rejected'],['stale','source_status_stale'],['offline','community_offline']]) {
    mode=next;await page.goto(origin+'/#sync-health');await page.reload();
    await page.locator(`[data-diagnostic="${code}"]`).waitFor();
  }
  mode='healthy';await page.reload();await page.locator('[data-diagnostic="source_verified"]').waitFor();
  mode='unavailable';
  // Wait for the actual 15-second refresh, not a remount: stale green state must disappear.
  await page.locator('.sync-health-view [role="alert"]').waitFor({timeout:25000});
  assert.equal(await page.locator('[data-diagnostic="source_verified"]').count(),0);
  assert.equal((await page.locator('body').innerText()).includes('PRIVATE_RAW_ERROR_DO_NOT_SHOW'),false);
  assert.deepEqual(errors,[]);
  console.log('Synchronization diagnostics browser states and failed-refresh clearing passed.');
} finally {
  await browser?.close();
  if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}
