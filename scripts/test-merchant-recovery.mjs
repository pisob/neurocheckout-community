// Transport-contract journey, not a substitute for real platform installation.
// Uses real encrypted vault/outbox/archive and simulated Cloud, never SMTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { saveRelayCredential, relayOnce } from './server-data-relay.mjs';
import { LocalDataStore } from './local-data-store.mjs';
import { EmailArchive } from './email-archive.mjs';

for (const platform of ['prestashop','woocommerce','magento']) for (const guest of [true,false]) {
  test(`${platform}: ${guest?'guest':'registered'} cart survives lost acknowledgement, restart and repeated archive confirmation`,async t=>{
    const directory=mkdtempSync(resolve(tmpdir(),'nc-merchant-recovery-'));
    t.after(()=>rmSync(directory,{recursive:true,force:true}));
    const options={directory,enabled:true,environment:'production',cloudUrl:'https://www.neurocheckout.com',clientId:'fixture',port:'13499',version:'0.1.0-preview.33',secret:'synthetic-secret-longer-than-32-characters'};
    const credential={token:'nc_data_'+randomBytes(32).toString('base64url'),installation_id:'11111111-1111-4111-8111-111111111111',shop_id:'fixture-'+platform};
    await saveRelayCredential(options,credential);
    let store=new LocalDataStore(directory,Date.now,'production');
    store.put({kind:'cart',sourceId:'cart-1',revision:1,operation:'upsert',observedAt:new Date().toISOString(),payload:{platform,customer_is_guest:guest,email:'fixture@example.invalid',items:[{id:'p1',name:'Product',image_url:'https://shop.example/image.jpg',url:'https://shop.example/product'}]}});
    const ids=store.signals().map(s=>s.id);store.close();
    let loseAck=true, phase='signals',confirmations=0;
    const received=new Set();
    const copy={delivery_id:'community-edge-1',recipient_email:'fixture@example.invalid',subject:'Cart',body_html:'<a href="https://shop.example/product"><img src="https://shop.example/image.jpg" alt="Product"></a>',body_text:'Product',agent_name:'abandoned_cart',copy_signature:'a'.repeat(64)};
    const mock=async(url,init)=>{
      if(url.endsWith('/api/health'))return Response.json({service:'neurocheckout-community'});
      assert.equal(init.headers.Authorization,'Bearer '+credential.token);
      if(url.endsWith('/signals')){
        const body=JSON.parse(init.body);assert.equal(init.body.includes('fixture@example.invalid'),false);
        for(const s of body.signals)received.add(s.id);
        if(loseAck){loseAck=false;throw new Error('simulated lost response after Cloud accepted');}
        return Response.json({accepted_ids:body.signals.map(s=>s.id)});
      }
      if(url.endsWith('/poll'))return Response.json({commands:phase==='signals'?[]:[{operation:phase,request_id:'b'.repeat(32),record:phase==='archive_email'?copy:{delivery_id:copy.delivery_id,sent_at:'2026-10-14T12:00:00Z'}}]});
      assert.equal(JSON.parse(init.body).result.status,'ok');confirmations++;
      return Response.json({accepted:true});
    };
    assert.equal(await relayOnce(options,mock),false);
    store=new LocalDataStore(directory,Date.now,'production');assert.deepEqual(store.signals().map(s=>s.id),ids);store.close();
    assert.equal(await relayOnce({...options},mock),true);
    assert.equal(received.size,1);
    store=new LocalDataStore(directory,Date.now,'production');assert.equal(store.signals().length,0);store.close();
    phase='archive_email';assert.equal(await relayOnce(options,mock),true);
    phase='confirm_email';assert.equal(await relayOnce(options,mock),true);assert.equal(await relayOnce(options,mock),true);
    const archive=new EmailArchive(directory,Date.now,'production');
    assert.equal(archive.db.prepare('SELECT count(*) n FROM email_archive WHERE sent_at IS NOT NULL').get().n,1);
    assert.equal(archive.get(copy.delivery_id).body_html,copy.body_html);archive.close();assert.equal(confirmations,3);
  });
}

test('overlapping relay attempts do not consume two polls or release another request lock',async t=>{
  const directory=mkdtempSync(resolve(tmpdir(),'nc-relay-concurrency-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const options={directory,enabled:true,environment:'production',cloudUrl:'https://www.neurocheckout.com',clientId:'fixture',port:'13499',version:'fixture',secret:'synthetic-secret-longer-than-32-characters'};
  await saveRelayCredential(options,{token:'nc_data_'+randomBytes(32).toString('base64url'),installation_id:'11111111-1111-4111-8111-111111111111',shop_id:'fixture'});
  let release, entered; const started=new Promise(r=>entered=r); const held=new Promise(r=>release=r);
  const first=relayOnce(options,async url=>{if(url.endsWith('/api/health'))return Response.json({service:'neurocheckout-community'});entered();await held;return Response.json({commands:[]});});
  await started;
  for(let i=0;i<2;i++)assert.equal(await relayOnce(options,()=>{throw new Error('must not fetch');}),false);
  release();assert.equal(await first,true);
  assert.equal(await relayOnce(options,async url=>Response.json(url.endsWith('/api/health')?{service:'neurocheckout-community'}:{commands:[]})),true);
});
