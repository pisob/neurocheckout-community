import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium,expect} from '@playwright/test';
const origin='http://127.0.0.1:13439';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','13439'],{
  stdio:'ignore',env:{...process.env,NC_DEPLOYMENT_ENV:'test',NC_LOCAL_DATA_PILOT_ENABLED:'false',NC_CONNECTOR_PULL_ENABLED:'false',NC_COMMUNITY_AVAILABILITY_ENABLED:'false'}});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
  for(const language of ['en','fr']) {
    const context=await browser.newContext();
    await context.addInitScript(lang=>localStorage.setItem('neurocheckout-community-ui-language',lang),language);
    const page=await context.newPage();await page.clock.install();
    let calls=0,status=429;
    await page.route('**/api/**',route=>{
      if(!route.request().url().endsWith('/capabilities'))return route.fulfill({json:{}});
      calls++;
      return route.fulfill({status,headers:status===429?{'Retry-After':'120'}:{},json:{detail:status===429?'community_resource_budget_exceeded:installation_daily_cost':status===401?'community_not_connected':'cloud_unavailable'}});
    });
    await page.goto(origin);
    const login=page.locator('a[href="/api/auth/start"]');
    await expect(page.getByText(language==='fr'?'Synchronisation en pause':'Synchronization paused',{exact:true})).toBeVisible();
    await expect(login).toHaveCount(0);
    const retry=page.getByRole('button',{name:language==='fr'?'Réessayer':'Try again',exact:true});
    await expect(retry).toBeDisabled();
    const initial=calls;await page.clock.fastForward(60_000);assert.equal(calls,initial);
    status=503;await page.clock.fastForward(61_000);
    await expect(page.getByText(language==='fr'?'Synchronisation en pause':'Synchronization paused',{exact:true})).toBeVisible();
    await expect(retry).toBeEnabled();await expect(login).toHaveCount(0);
    status=401;await retry.click();await expect(login).toBeVisible();
    console.log('PASS '+language+': rate limit cooldown and transient failure preserve connection UI; only 401 requests login.');
    await context.close();
  }
} finally {if(browser)await browser.close();server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit');}
