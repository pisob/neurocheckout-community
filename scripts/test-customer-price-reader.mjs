import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { LocalDataStore, initializeLocalData } from './local-data-store.mjs';
import { SourceSynchronizer } from './local-source-sync.mjs';
import { readCustomerPrices, validateCustomerPriceRequest, validateCustomerPrices } from './customer-price-reader.mjs';
import { sourceRequestSignature, sourceResponseSignature } from './source-pull-client.mjs';
import { saveRelayCredential, relayOnce } from './server-data-relay.mjs';

const installation = '11111111-1111-4111-8111-111111111111';
const input = () => ({ storeId:'2', websiteId:'7', customerId:'42', customerEmail:'private@example.test', productIds:['1','2'], currency:'EUR' });
const prices = () => ({ schema:'magento-customer-prices-v1', store_id:2, website_id:7, customer_id:42,
  customer_email:'private@example.test', customer_group_id:3, customer_tax_class_id:9, currency:'EUR', quantity:1,
  read_at:new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), offers:[{ product_id:'1', status:'available', currency:'EUR',
    price_excl_tax:10, price_incl_tax:12, display_mode:'including_tax', display_price:12 }, { product_id:'2',status:'unavailable' }] });
const source = { endpoint:'https://shop.example.invalid/neurocheckout/community/pull', secret:'ab'.repeat(32) };
function fixture(t, configuration = source) {
  const directory=mkdtempSync(resolve(tmpdir(),'nc-price-reader-'));
  initializeLocalData(directory,'synthetic-shop');
  const store=new LocalDataStore(directory); store.bindInstallation(installation);
  const sync=new SourceSynchronizer(store); sync.configure(configuration);
  store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {directory,store,sync};
}
function transport(mutate = v => v, after = () => {}) {
  return async (url, body, headers) => {
    assert.equal(url,source.endpoint);
    const request=JSON.parse(body);
    assert.equal(request.operation,'customer_prices'); assert.equal(request.shopId,'synthetic-shop');
    assert.equal(headers['X-NC-Source-Signature'],sourceRequestSignature(source.secret,new URL(url).pathname,
      request.shopId,headers['X-NC-Source-Time'],headers['X-NC-Source-Nonce'],body));
    const page=mutate({schema:1,shopId:'synthetic-shop',operation:'customer_prices',requestHash:createHash('sha256').update(body).digest('hex'),prices:prices()});
    const raw=Buffer.from(JSON.stringify(page));
    after();
    return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
  };
}
test('signed prices remain recipient-specific, transient and outside catalog/outbox', async t => {
  const {store,directory}=fixture(t);
  const result=await readCustomerPrices(store,input(),transport());
  assert.deepEqual(Object.keys(result),['schema','shopId','installationId','prices']);
  assert.equal(result.installationId,installation); assert.equal(result.prices.offers[0].display_price,12);
  assert.equal(store.signals().length,0);
  assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);
  for(const name of readdirSync(directory).filter(n=>n.startsWith('local-data.sqlite')))
    assert.equal(readFileSync(resolve(directory,name)).includes(Buffer.from('private@example.test')),false);
});
test('strict bounded request rejects caller URLs, foreign inputs and noncanonical identifiers', async t => {
  const {store}=fixture(t);
  for(const patch of [{url:'https://external.invalid'},{storeId:2},{websiteId:'0'},{customerId:true},{customerEmail:'bad'},
    {currency:'eur'},{productIds:[]},{productIds:['1','1']},{productIds:Array.from({length:17},(_,i)=>String(i+1))},
    {productIds:['01']},{productIds:[1]},{productIds:[null]}]) {
    assert.throws(()=>validateCustomerPriceRequest({...input(),...patch}),/customer_prices_unavailable/);
    await assert.rejects(readCustomerPrices(store,{...input(),...patch},()=>assert.fail('no network')),/customer_prices_unavailable/);
  }
});
test('all response identities, product order and monetary semantics are checked', async t => {
  const {store}=fixture(t);
  const mutate = [p=>p.shopId='foreign',p=>p.requestHash='f'.repeat(64),p=>p.operation='read',p=>p.prices.customer_id=43,
    p=>p.prices.customer_email='other@example.test',p=>p.prices.store_id=3,p=>p.prices.website_id=8,p=>p.prices.currency='USD',
    p=>p.prices.quantity=true,p=>p.prices.customer_group_id=-1,p=>p.prices.address='private address',p=>p.prices.offers.pop(),
    p=>p.prices.offers.reverse(),p=>p.prices.offers.push(p.prices.offers[0]),p=>p.prices.offers[0].price_excl_tax=true,
    p=>p.prices.offers[0].price_incl_tax=-1,p=>p.prices.offers[0].display_price=10,p=>p.prices.offers[0].display_mode='both',
    p=>p.prices.offers[1].display_price=0,p=>p.prices.offers[0].currency='USD',p=>p.prices.customer_id='42',
    p=>p.prices.read_at='2020-01-01T00:00:00Z',p=>p.prices.read_at='2099-01-01T00:00:00Z'];
  for(const change of mutate) await assert.rejects(readCustomerPrices(store,input(),transport(p=>{change(p);return p;})),/customer_prices_unavailable/);
  const dual=prices();dual.offers[0].display_mode='both';dual.offers[0].display_price=null;
  assert.equal(validateCustomerPrices(dual,input()).offers[0].display_price,null);
});
test('tampering, response replay, oversize bodies and malformed UTF8 are refused', async t => {
  const {store}=fixture(t);let previous;
  await readCustomerPrices(store,input(),async(...args)=>{previous=await transport()(...args);return previous;});
  for(const response of [previous,{...previous,signature:'0'.repeat(64)},{...previous,body:Buffer.alloc(16385)},
    {body:Buffer.from([255]),signature:'f'.repeat(64)}])
    await assert.rejects(readCustomerPrices(store,input(),async()=>response),/customer_prices_unavailable/);
  await assert.rejects(readCustomerPrices(store,input(),async(_url,_body,headers)=>{
    const raw=Buffer.from([255]);
    return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
  }),/customer_prices_unavailable/);
});
test('stale source, wrong platform, key rotation and installation drift fail closed', async t => {
  const {store,sync}=fixture(t);
  store.db.prepare('UPDATE source_sync SET ready=0 WHERE id=1').run();
  await assert.rejects(readCustomerPrices(store,input(),()=>assert.fail('no network')),/customer_prices_unavailable/);
  store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  await assert.rejects(readCustomerPrices(store,input(),transport(v=>v,()=>{
    sync.configure({...source,secret:'cd'.repeat(32)});
    store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  })),/customer_prices_unavailable/);
  sync.configure(source);store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  await assert.rejects(readCustomerPrices(store,input(),transport(v=>v,()=>store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run('22222222-2222-4222-8222-222222222222'))),/customer_prices_unavailable/);
  const other=fixture(t,{...source,endpoint:'https://shop.example.invalid/wp-json/neurocheckout/v1/communitydata'});
  await assert.rejects(readCustomerPrices(other.store,input(),()=>assert.fail('no network')),/customer_prices_unavailable/);
});
test('outgoing Cloud command reaches signed native transport and replies on fixed origin', async t => {
  const {store,directory}=fixture(t);
  const options={directory,enabled:true,environment:'staging',secret:'synthetic-session-secret-over-32-chars',
    cloudUrl:'http://127.0.0.1:43120',clientId:'synthetic-client',port:'43119',version:'synthetic'};
  const credential={token:'nc_data_'+randomBytes(32).toString('base64url'),installation_id:installation,shop_id:'synthetic-shop'};
  await saveRelayCredential(options,credential);let result;
  const mock=async(url,init)=>{
    if(url.endsWith('/api/health'))return Response.json({service:'neurocheckout-community'});
    assert.ok(url.startsWith(options.cloudUrl));assert.equal(init.headers.Authorization,'Bearer '+credential.token);
    if(url.endsWith('/poll'))return Response.json({commands:[{request_id:'a'.repeat(32),operation:'read_customer_prices',record:input()}]});
    assert.ok(url.endsWith('/reply'));result=JSON.parse(init.body).result;return Response.json({accepted:true});
  };
  assert.equal(await relayOnce(options,mock,transport()),true);
  assert.equal(result.status,'ok');assert.equal(result.result.prices.offers[0].display_price,12);
  assert.equal(store.signals().length,0);
  assert.equal(await relayOnce(options,mock,async()=>{throw Error('private native error');}),true);
  assert.deepEqual(result,{status:'unavailable'});
});

const wooInput=()=>({blogId:'1',customerId:'42',customerEmail:'private@example.test',productIds:['1','2'],currency:'EUR'});
const wooPrices=()=>({schema:'woocommerce-customer-prices-v1',blog_id:1,customer_id:42,customer_email:'private@example.test',
  currency:'EUR',quantity:1,price_decimals:2,context_hash:'a'.repeat(64),read_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
  offers:[{product_id:'1',status:'available',currency:'EUR',price_excl_tax:10.1234,price_incl_tax:12.15,
    display_mode:'excluding_tax',display_price:10.12},{product_id:'2',status:'unavailable'}]});
const wooSource={...source,endpoint:'https://shop.example.invalid/wp-json/neurocheckout/v1/communitydata'};
function wooTransport(change=()=>{},after=()=>{}){
  return async(url,body,headers)=>{
    assert.equal(url,wooSource.endpoint);const request=JSON.parse(body);assert.equal(request.blogId,'1');
    assert.equal(headers['X-NC-Source-Signature'],sourceRequestSignature(source.secret,new URL(url).pathname,
      request.shopId,headers['X-NC-Source-Time'],headers['X-NC-Source-Nonce'],body));
    const page={schema:1,shopId:'synthetic-shop',operation:'customer_prices',requestHash:createHash('sha256').update(body).digest('hex'),prices:wooPrices()};
    change(page);after();const raw=Buffer.from(JSON.stringify(page));return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
  };
}
test('Woo signed price transport validates native rounding and leaves no recipient records',async t=>{
  const {store,directory}=fixture(t,wooSource);const result=await readCustomerPrices(store,wooInput(),wooTransport());
  assert.equal(result.prices.offers[0].display_price,10.12);assert.equal(store.signals().length,0);
  assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);
  for(const name of readdirSync(directory).filter(n=>n.startsWith('local-data.sqlite')))
    assert.equal(readFileSync(resolve(directory,name)).includes(Buffer.from('private@example.test')),false);
});
test('Woo strict requests and cross-platform source routing',async t=>{
  const {store}=fixture(t,wooSource),magento=fixture(t);
  for(const patch of [{storeId:'2'},{blogId:1},{blogId:'0'},{productIds:[]},{productIds:['1','1']},{customerEmail:'bad'}])
    await assert.rejects(readCustomerPrices(store,{...wooInput(),...patch},()=>assert.fail('no network')),/customer_prices_unavailable/);
  await assert.rejects(readCustomerPrices(magento.store,wooInput(),()=>assert.fail('no network')),/customer_prices_unavailable/);
  await assert.rejects(readCustomerPrices(store,input(),()=>assert.fail('no network')),/customer_prices_unavailable/);
});
test('Woo native scope, context, precision, freshness and complete response cannot drift',async t=>{
  const {store}=fixture(t,wooSource);
  for(const change of [p=>p.prices.schema='magento-customer-prices-v1',p=>p.prices.blog_id=2,p=>p.prices.customer_id='42',
    p=>p.prices.customer_email='foreign@example.test',p=>p.prices.context_hash='bad',p=>p.prices.price_decimals=true,
    p=>p.prices.price_decimals=7,p=>p.prices.currency='USD',p=>p.prices.read_at='2020-01-01T00:00:00Z',
    p=>p.prices.address='private',p=>p.prices.offers.reverse(),p=>p.prices.offers.pop(),p=>p.prices.offers[0].display_price=10.13,
    p=>p.prices.offers[0].display_price=10.123,p=>p.prices.offers[0].display_mode='both',p=>p.prices.offers[0].price_excl_tax=true,
    p=>p.prices.offers[1].display_price=0,p=>p.requestHash='b'.repeat(64)])
    await assert.rejects(readCustomerPrices(store,wooInput(),wooTransport(change)),/customer_prices_unavailable/);
  let previous;await readCustomerPrices(store,wooInput(),async(...args)=>{previous=await wooTransport()(...args);return previous;});
  await assert.rejects(readCustomerPrices(store,wooInput(),async()=>previous),/customer_prices_unavailable/);
});
test('Woo rotated source credentials, source outage and installation replacement invalidate read',async t=>{
  for(const mode of ['key','source','installation']){
    const {store,sync}=fixture(t,wooSource);
    await assert.rejects(readCustomerPrices(store,wooInput(),wooTransport(()=>{},()=>{
      if(mode==='key')sync.configure({...wooSource,secret:'cd'.repeat(32)});
      if(mode==='source')store.db.prepare('UPDATE source_sync SET ready=0 WHERE id=1').run();
      if(mode==='installation')store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run('22222222-2222-4222-8222-222222222222');
    })),/customer_prices_unavailable/);
  }
});
