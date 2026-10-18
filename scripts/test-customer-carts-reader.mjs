import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {LocalDataStore,initializeLocalData} from './local-data-store.mjs';
import {SourceSynchronizer} from './local-source-sync.mjs';
import {sourceRequestSignature,sourceResponseSignature} from './source-pull-client.mjs';
import {readCustomerCarts,validateCustomerCarts,validateCustomerCartsRequest} from './customer-carts-reader.mjs';
import {saveRelayCredential,relayOnce} from './server-data-relay.mjs';

const installation='11111111-1111-4111-8111-111111111111';
for(const platform of ['prestashop','woocommerce','magento']) {
  const source={secret:'ab'.repeat(32),endpoint:'https://shop.example.invalid'+{
    prestashop:'/module/neurocheckoutconnector/communitydata',woocommerce:'/wp-json/neurocheckout/v1/communitydata',magento:'/neurocheckout/community/pull'}[platform]};
  const input=()=>({customerId:'7',customerEmail:'private@example.invalid',...{
    prestashop:{nativeShopId:'1'},woocommerce:{blogId:'1'},magento:{storeId:'1',websiteId:'2'}}[platform]});
  const carts=()=>({schema:platform+'-customer-carts-v1',identity:input(),read_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
    complete:true,has_active_cart:false,marketing_consent:'granted'});
  function fixture(t,configuration=source) {
    const directory=mkdtempSync(resolve(tmpdir(),'nc-carts-reader-'));initializeLocalData(directory,'synthetic-shop');
    const store=new LocalDataStore(directory);store.bindInstallation(installation);
    const sync=new SourceSynchronizer(store);sync.configure(configuration);
    store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
    t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
    return {directory,store,sync};
  }
  function transport(mutate=p=>p,after=()=>{}) {
    return async(url,body,headers)=>{
      assert.equal(url,source.endpoint);const request=JSON.parse(body);
      assert.deepEqual(request,{schema:1,shopId:'synthetic-shop',operation:'customer_carts',...input()});
      assert.equal(headers['X-NC-Source-Signature'],sourceRequestSignature(source.secret,new URL(url).pathname,
        request.shopId,headers['X-NC-Source-Time'],headers['X-NC-Source-Nonce'],body));
      const page=mutate({schema:1,shopId:'synthetic-shop',operation:'customer_carts',requestHash:createHash('sha256').update(body).digest('hex'),carts:carts()});
      const raw=Buffer.from(JSON.stringify(page));after();
      return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
    };
  }
  test(platform+': signed empty and active cart facts stay transient',async t=>{
    const {store,directory}=fixture(t);
    assert.equal((await readCustomerCarts(store,input(),transport())).carts.has_active_cart,false);
    assert.equal((await readCustomerCarts(store,input(),transport(p=>{p.carts.has_active_cart=true;return p;}))).carts.has_active_cart,true);
    assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);assert.equal(store.signals().length,0);
    for(const name of readdirSync(directory).filter(n=>n.startsWith('local-data.sqlite')))
      assert.equal(readFileSync(resolve(directory,name)).includes(Buffer.from(input().customerEmail)),false);
  });
  test(platform+': pending synchronization preserves active-cart proof but failure closes reads',async t=>{
    const {store,sync}=fixture(t);let lease;
    const value=await readCustomerCarts(store,input(),transport(p=>{p.carts.has_active_cart=true;return p;},()=>{lease=sync.claim();}));
    assert.equal(value.carts.has_active_cart,true);
    assert.equal(store.signals().length,0);
    sync.failed(lease);
    await assert.rejects(readCustomerCarts(store,input(),()=>assert.fail('no network after failed sync')),/customer_carts_unavailable/);
  });
  test(platform+': callbacks, mixed scopes and malformed accounts fail before source read',async t=>{
    const {store}=fixture(t);
    for(const patch of [{customerId:7},{customerId:'0'},{customerEmail:'bad'},{callback:'https://other.invalid'},
      {nativeShopId:'1',storeId:'1',blogId:'1'},{customerEmail:'private@example.invalid\n'}]) {
      assert.throws(()=>validateCustomerCartsRequest({...input(),...patch}),/customer_carts_unavailable/);
      await assert.rejects(readCustomerCarts(store,{...input(),...patch},()=>assert.fail('no network')),/customer_carts_unavailable/);
    }
  });
  test(platform+': malformed, stale, partial or foreign proofs are unavailable',async t=>{
    const {store}=fixture(t);
    const changes=[p=>p.schema=true,p=>p.shopId='foreign',p=>p.operation='customer_history',p=>p.requestHash='f'.repeat(64),
      p=>p.carts.schema='other-customer-carts-v1',p=>p.carts.complete=false,p=>p.carts.has_active_cart=0,
      p=>p.carts.has_active_cart=null,p=>p.carts.has_active_cart='false',p=>p.carts.marketing_consent='yes',
      p=>p.carts.identity.customerId='8',p=>p.carts.identity.customerEmail='other@example.invalid',
      p=>p.carts.identity.callback='foreign',p=>p.carts.read_at='2020-01-01T00:00:00Z',
      p=>p.carts.read_at='2099-01-01T00:00:00Z',p=>p.carts.read_at='2026-02-30T00:00:00Z',p=>p.carts.private='content'];
    for(const change of changes)await assert.rejects(readCustomerCarts(store,input(),transport(p=>{change(p);return p;})),/customer_carts_unavailable/);
    for(const state of ['granted','denied','unknown'])assert.equal(validateCustomerCarts({...carts(),marketing_consent:state},input()).marketing_consent,state);
  });
  test(platform+': oversized, unsigned, replayed and unavailable replies fail closed',async t=>{
    const {store}=fixture(t);
    for(const sourceRead of [()=>{throw Error('private SQL');},()=>({body:Buffer.alloc(4097),signature:'a'.repeat(64)}),
      async(...args)=>({...await transport()(...args),signature:'e'.repeat(64)}),()=>({body:Buffer.from([255]),signature:'e'.repeat(64)})])
      await assert.rejects(readCustomerCarts(store,input(),sourceRead),/customer_carts_unavailable/);
    let previous;
    const reuse=async(...args)=>previous??=await transport()(...args);
    await readCustomerCarts(store,input(),reuse);
    await assert.rejects(readCustomerCarts(store,input(),reuse),/customer_carts_unavailable/);
  });
  for(const mode of ['source','secret','installation','unavailable','platform','deadline'])test(platform+': '+mode+' changes invalidate native proof',async t=>{
    const {store,sync}=fixture(t,mode==='platform'?{...source,endpoint:'https://shop.example.invalid'+(platform==='magento'
      ?'/wp-json/neurocheckout/v1/communitydata':'/neurocheckout/community/pull')}:source);
    const after=()=>{
      if(mode==='source')sync.configure({...source,endpoint:'https://other.example.invalid'+new URL(source.endpoint).pathname});
      if(mode==='secret')sync.configure({...source,secret:'cd'.repeat(32)});
      if(mode==='installation')store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run('22222222-2222-4222-8222-222222222222');
      if(mode==='unavailable')store.db.prepare('UPDATE source_sync SET ready=0 WHERE id=1').run();
    };
    const call=transport(p=>p,after);
    if(mode==='deadline') {
      const now=Date.now;let offset=0;Date.now=()=>now()+offset;
      try{await assert.rejects(readCustomerCarts(store,input(),async(...args)=>{const value=await call(...args);offset=6001;return value;}),/customer_carts_unavailable/);}
      finally{Date.now=now;}
    }else await assert.rejects(readCustomerCarts(store,input(),mode==='platform'?()=>assert.fail('wrong platform'):call),/customer_carts_unavailable/);
  });
  test(platform+': actual relay forwards only bound transient command',async t=>{
    const {directory}=fixture(t);let sent;
    const options={directory,enabled:true,environment:'staging',secret:'synthetic-session-secret-over-32-chars',
      cloudUrl:'http://127.0.0.1:43120',clientId:'synthetic-client',port:'43119',version:'synthetic'};
    await saveRelayCredential(options,{installation_id:installation,shop_id:'synthetic-shop',token:'nc_data_'+'a'.repeat(43)});
    const request_id='ab'.repeat(16);
    const fetchImpl=async(url,options)=>{
      if(url.endsWith('/api/health'))return Response.json({service:'neurocheckout-community'});
      if(url.endsWith('/poll'))return Response.json({commands:[{request_id,operation:'read_customer_carts',record:input()}]});
      assert.equal(url,'http://127.0.0.1:43120/api/v1/public/community-relay/reply');sent=JSON.parse(options.body);
      return Response.json({accepted:true});
    };
    assert.equal(await relayOnce(options,fetchImpl,transport()),true);
    assert.equal(sent.result.status,'ok');assert.equal(sent.result.result.carts.has_active_cart,false);
    assert.equal(sent.result.result.installationId,installation);
  });
}
