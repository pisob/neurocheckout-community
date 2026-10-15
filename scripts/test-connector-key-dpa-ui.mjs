import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';

const origin='http://127.0.0.1:13431';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','13431'],{
  stdio:'ignore',env:{...process.env,NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false'},
});
const shop={shop_uuid:'11111111-1111-4111-8111-111111111111',shop_id:'fixture',platform:'woocommerce'};
const capabilities={schema_version:'1.1',manifest:{authority:'neurocheckout_cloud',deny_by_default:true},
  plan:{code:'pro',edition:'community'},subscription:{status:'paid_active',active:true},limits:{shops:4,active_agents:8,emails:{limit:1000,used:0,remaining:1000,scope:'shop',shop_id:shop.shop_id,shop_uuid:shop.shop_uuid,window:'rolling_24h',window_hours:24}},
  features:{member_dashboard:true},agents:{available:[],coordination_enabled:false},connectors:[],
  dashboard:{current_version:'0.1.0-preview.37'},upgrade:{available:false,target_plans:[]}};
let browser;
try {
  for(let i=0;i<100;i++) {try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  for (const language of ['en','fr']) {
    const context=await browser.newContext();
    await context.addInitScript(lang=>{if(window.top===window)localStorage.setItem('neurocheckout-community-ui-language',lang);},language);
    const page=await context.newPage();
    const errors=[],external=[],mutations=[];
    let unavailable=true, changed=false, submissions=0;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin) {external.push(url.origin);return route.abort();}
      if(!url.pathname.startsWith('/api/'))return route.continue();
      let body={},status=200;
      if(request.method()!=='GET')mutations.push(url.pathname);
      if(url.pathname.endsWith('/capabilities'))body=capabilities;
      else if(url.pathname.endsWith('/shops'))body={items:[shop]};
      else if(url.pathname.endsWith('/setup'))body={available:true,configured:true};
      else if(url.pathname.endsWith('/connector-key/dpa')) {
        if(unavailable){status=503;body={detail:'dpa_document_unavailable'};}
        else {const version=changed?'1.3':'1.2';body={version,html:'<p>Published '+version+'</p>',source:'published',locale:url.searchParams.get('locale'),document_sha256:(changed?'b':'a').repeat(64),acceptance_text:(language==='fr'?'J’accepte ':'I accept ')+version};}
      } else if(url.pathname.endsWith('/connector-key')) {
        const accepted=request.postDataJSON(); submissions++;
        assert.equal(accepted.dpa_locale,language);
        assert.equal(accepted.dpa_accepted,true);
        assert.equal(accepted.dpa_version,changed?'1.3':'1.2');
        assert.equal(accepted.dpa_document_sha256,(changed?'b':'a').repeat(64));
        if(!changed){changed=true;status=409;body={detail:'dpa_document_changed'};}
        else body={api_key:'synthetic-fixture-not-a-real-key'};
      }
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(origin+'/?tool=connector#configuration');
    const panel=page.locator('#configuration');
    const keyButton=panel.getByRole('button',{name:language==='fr'?'Créer la clé':'Create key',exact:true});
    const checkbox=panel.locator('input[type=checkbox]');
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(keyButton).toBeDisabled(); await expect(checkbox).toBeDisabled();
    unavailable=false;
    await panel.getByRole('button',{name:language==='fr'?'Réessayer':'Retry',exact:true}).click();
    await expect(checkbox).toBeEnabled(); await expect(keyButton).toBeDisabled();
    await checkbox.check(); await keyButton.click();
    await expect(panel.locator('summary')).toContainText('1.3');
    await expect(checkbox).not.toBeChecked(); await expect(keyButton).toBeDisabled();
    await checkbox.check(); await keyButton.click();
    await expect(panel.locator('.one-time-secret')).toContainText('synthetic-fixture-not-a-real-key');
    assert.equal(submissions,2);
    assert.deepEqual(mutations,['/api/cloud/connector-key','/api/cloud/connector-key','/api/local-data/setup']);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS '+language+': unavailable blocks, published consent, stale document resets, renewed consent submits exact contract.');
    await context.close();
  }
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');
}
