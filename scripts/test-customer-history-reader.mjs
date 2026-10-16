import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {LocalDataStore,initializeLocalData} from './local-data-store.mjs';
import {SourceSynchronizer} from './local-source-sync.mjs';
import {sourceRequestSignature,sourceResponseSignature} from './source-pull-client.mjs';
import {readCustomerHistory,validateCustomerHistory,validateCustomerHistoryRequest} from './customer-history-reader.mjs';
import {saveRelayCredential,relayOnce} from './server-data-relay.mjs';

const installation='11111111-1111-4111-8111-111111111111';
const source={endpoint:'https://shop.example.invalid/neurocheckout/community/pull',secret:'ab'.repeat(32)};
const input=()=>({storeId:'1',websiteId:'2',customerId:'7',customerEmail:'private@example.test'});
function history() {
  return {schema:'magento-customer-history-v1',store_id:1,website_id:2,customer_id:7,customer_email:'private@example.test',
    customer_group_id:3,customer_created_at:'2020-01-01 00:00:00',read_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
    complete:true,order_count:1,marketing_consent:'granted',orders:[{order_id:'1',state:'new',status:'pending',
      created_at:'2020-02-01 00:00:00',updated_at:'2020-02-01 00:00:00',currency:'EUR',grand_total:'40.0000',total_paid:null,total_refunded:null,
      items:[{item_id:'11',parent_item_id:null,product_id:'3',product_type:'simple',qty_ordered:'2.0000',qty_invoiced:'0.0000',qty_refunded:'0.0000',qty_canceled:'0.0000'}]}]};
}
function fixture(t,configuration=source) {
  const directory=mkdtempSync(resolve(tmpdir(),'nc-history-reader-'));initializeLocalData(directory,'synthetic-shop');
  const store=new LocalDataStore(directory);store.bindInstallation(installation);
  const sync=new SourceSynchronizer(store);sync.configure(configuration);
  store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {directory,store,sync};
}
function transport(mutate=v=>v,after=()=>{}) {
  return async(url,body,headers)=>{
    assert.equal(url,source.endpoint);const request=JSON.parse(body);
    assert.equal(request.operation,'customer_history');
    assert.equal(headers['X-NC-Source-Signature'],sourceRequestSignature(source.secret,new URL(url).pathname,
      request.shopId,headers['X-NC-Source-Time'],headers['X-NC-Source-Nonce'],body));
    const page=mutate({schema:1,shopId:'synthetic-shop',operation:'customer_history',requestHash:createHash('sha256').update(body).digest('hex'),history:history()});
    const raw=Buffer.from(JSON.stringify(page));after();
    return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
  };
}
test('native order facts are authenticated, transient and preserve unknown payments',async t=>{
  const {store,directory}=fixture(t),value=await readCustomerHistory(store,input(),transport());
  assert.equal(value.history.orders[0].total_paid,null);assert.equal(value.installationId,installation);
  assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);assert.equal(store.signals().length,0);
  for(const name of readdirSync(directory).filter(n=>n.startsWith('local-data.sqlite')))
    assert.equal(readFileSync(resolve(directory,name)).includes(Buffer.from('private@example.test')),false);
  const empty=history();empty.orders=[];empty.order_count=0;assert.deepEqual(validateCustomerHistory(empty,input()).orders,[]);
});
test('requests cannot carry foreign types, callbacks or caller-selected time windows',async t=>{
  const {store}=fixture(t);
  for(const patch of [{storeId:1},{websiteId:true},{customerId:'01'},{customerEmail:'bad'},{url:'https://other.invalid'},{since:'2020'}]) {
    assert.throws(()=>validateCustomerHistoryRequest({...input(),...patch}),/customer_history_unavailable/);
    await assert.rejects(readCustomerHistory(store,{...input(),...patch},()=>assert.fail('no network')),/customer_history_unavailable/);
  }
});
test('scope, completeness, order/item relations, native dates and decimals stay strict',async t=>{
  const {store}=fixture(t);
  const changes=[p=>p.shopId='foreign',p=>p.operation='customer_prices',p=>p.requestHash='f'.repeat(64),
    p=>p.history.store_id=2,p=>p.history.website_id=1,p=>p.history.customer_id=8,p=>p.history.customer_email='other@example.test',
    p=>p.history.complete=false,p=>p.history.order_count=true,p=>p.history.customer_group_id=-1,
    p=>p.history.customer_created_at='2020-02-30 00:00:00',p=>p.history.read_at='2020-01-01T00:00:00Z',
    p=>p.history.orders=[],p=>p.history.orders[0].total_paid=true,p=>p.history.orders[0].total_paid='NaN',
    p=>p.history.orders[0].total_paid='-1',p=>p.history.orders[0].currency='eur',p=>p.history.orders[0].items=[],
    p=>p.history.orders[0].items[0].parent_item_id='11',p=>p.history.orders[0].items[0].product_id=true,
    p=>p.history.orders[0].items[0].qty_canceled='1e2',p=>p.history.address='private',
    p=>p.history.orders[0].items.push(p.history.orders[0].items[0]),
    p=>{p.history.orders.push(p.history.orders[0]);p.history.order_count=2;},
    p=>{p.history.orders[0].items.push({...p.history.orders[0].items[0],item_id:'12',parent_item_id:'11'});p.history.orders[0].items[0].parent_item_id='12';}];
  for(const change of changes)await assert.rejects(readCustomerHistory(store,input(),transport(p=>{change(p);return p;})),/customer_history_unavailable/);
  for(const consent of ['granted','denied','unknown']) {const h=history();h.marketing_consent=consent;assert.equal(validateCustomerHistory(h,input()).marketing_consent,consent);}
});
test('replay, oversized data, signed malformed UTF8 and source changes are refused',async t=>{
  const {store,sync}=fixture(t);let previous;
  await readCustomerHistory(store,input(),async(...args)=>{previous=await transport()(...args);return previous;});
  for(const value of [previous,{...previous,signature:'0'.repeat(64)},{...previous,body:Buffer.alloc(65537)}])
    await assert.rejects(readCustomerHistory(store,input(),async()=>value),/customer_history_unavailable/);
  await assert.rejects(readCustomerHistory(store,input(),async(_url,_body,headers)=>{
    const raw=Buffer.from([255]);return {body:raw,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],raw)};
  }),/customer_history_unavailable/);
  await assert.rejects(readCustomerHistory(store,input(),transport(v=>v,()=>{
    sync.configure({...source,secret:'cd'.repeat(32)});store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  })),/customer_history_unavailable/);
  sync.configure(source);store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  await assert.rejects(readCustomerHistory(store,input(),transport(v=>v,()=>store.db.prepare("UPDATE meta SET value='foreign' WHERE name='installation_id'").run())),/customer_history_unavailable/);
  const other=fixture(t,{...source,endpoint:'https://shop.example.invalid/wp-json/neurocheckout/v1/communitydata'});
  await assert.rejects(readCustomerHistory(other.store,input(),()=>assert.fail('no network')),/customer_history_unavailable/);
});
test('outgoing relay handles history command without catalog mutation or raw errors',async t=>{
  const {store,directory}=fixture(t);
  const options={directory,enabled:true,environment:'staging',secret:'synthetic-session-secret-over-32-chars',
    cloudUrl:'http://127.0.0.1:43120',clientId:'synthetic-client',port:'43119',version:'synthetic'};
  const credential={token:'nc_data_'+randomBytes(32).toString('base64url'),installation_id:installation,shop_id:'synthetic-shop'};
  await saveRelayCredential(options,credential);let result;
  const fetchMock=async(url,init)=>{
    if(url.endsWith('/api/health'))return Response.json({service:'neurocheckout-community'});
    assert.ok(url.startsWith(options.cloudUrl));assert.equal(init.headers.Authorization,'Bearer '+credential.token);
    if(url.endsWith('/poll'))return Response.json({commands:[{request_id:'a'.repeat(32),operation:'read_customer_history',record:input()}]});
    result=JSON.parse(init.body).result;return Response.json({accepted:true});
  };
  assert.equal(await relayOnce(options,fetchMock,transport()),true);assert.equal(result.status,'ok');
  assert.equal(result.result.history.order_count,1);assert.equal(store.signals().length,0);
  assert.equal(await relayOnce(options,fetchMock,async()=>{throw Error('private details');}),true);
  assert.deepEqual(result,{status:'unavailable'});
});

const wooSource={...source,endpoint:'https://shop.example.invalid/shop/wp-json/neurocheckout/v1/communitydata'};
const wooInput=()=>({blogId:'1',customerId:'7',customerEmail:'private@example.test'});
function wooHistory() {
  const item={item_id:'11',product_id:'3',variation_id:'4',quantity:'2.00000000',line_total:'40.00000000',line_tax:'8.00000000',refunded_item_id:null};
  return {schema:'woocommerce-customer-history-v1',blog_id:1,customer_id:7,customer_email:'private@example.test',
    customer_created_at:'2020-01-01 00:00:00',read_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),complete:true,
    order_storage:'hpos',order_count:1,marketing_consent:'unknown',orders:[{order_id:'1',status:'wc-on-hold',
      created_at:'2020-02-01 00:00:00',updated_at:'2020-02-01 00:00:00',currency:'EUR',total:'48.00000000',date_paid_gmt:null,
      items:[item],refunds:[{refund_id:'2',created_at:'2020-02-02 00:00:00',amount:'24.00000000',payment_refunded:null,
        items:[{...item,item_id:'12',quantity:'-1',line_total:'-20',line_tax:'-4',refunded_item_id:'11'}]}]}]};
}
function wooTransport(change=()=>{},after=()=>{}) {
  return async(url,body,headers)=>{
    assert.equal(url,wooSource.endpoint);const request=JSON.parse(body);
    assert.deepEqual(request,{schema:1,shopId:'synthetic-shop',operation:'customer_history',...wooInput()});
    assert.equal(headers['X-NC-Source-Signature'],sourceRequestSignature(wooSource.secret,new URL(url).pathname,
      request.shopId,headers['X-NC-Source-Time'],headers['X-NC-Source-Nonce'],body));
    const page={schema:1,shopId:'synthetic-shop',operation:'customer_history',requestHash:createHash('sha256').update(body).digest('hex'),history:wooHistory()};
    change(page);const raw=Buffer.from(JSON.stringify(page));after();
    return {body:raw,signature:sourceResponseSignature(wooSource.secret,headers['X-NC-Source-Nonce'],raw)};
  };
}
test('Woo history stays transient and preserves posts/HPOS, native decimals and unknown payments',async t=>{
  const {store,directory}=fixture(t,wooSource);
  for(const storage of ['posts','hpos']) {
    const value=await readCustomerHistory(store,wooInput(),wooTransport(p=>p.history.order_storage=storage));
    assert.equal(value.history.order_storage,storage);assert.equal(value.history.orders[0].date_paid_gmt,null);
    assert.equal(value.history.orders[0].total,'48.00000000');assert.equal(value.history.orders[0].refunds[0].payment_refunded,null);
    assert.equal(value.installationId,installation);assert.equal(value.history.marketing_consent,'unknown');
    assert.equal(Object.hasOwn(value.history.orders[0],'total_paid'),false);
  }
  assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n,0);assert.equal(store.signals().length,0);
  for(const name of readdirSync(directory).filter(n=>n.startsWith('local-data.sqlite')))
    assert.equal(readFileSync(resolve(directory,name)).includes(Buffer.from('private@example.test')),false);
  const empty=wooHistory();empty.orders=[];empty.order_count=0;
  assert.deepEqual(validateCustomerHistory(empty,wooInput()).orders,[]);
});
test('Woo requests cannot cross native platform, blog or account contracts',async t=>{
  const {store}=fixture(t,wooSource);
  for(const patch of [{blogId:1},{blogId:'01'},{customerId:false},{customerEmail:'bad'},
      {websiteId:'2'},{storeId:'1'},{url:'https://other.invalid'},{since:'2020'}]) {
    await assert.rejects(readCustomerHistory(store,{...wooInput(),...patch},()=>assert.fail('no network')),/customer_history_unavailable/);
  }
  const magento=fixture(t);
  await assert.rejects(readCustomerHistory(magento.store,wooInput(),()=>assert.fail('no network')),/customer_history_unavailable/);
  await assert.rejects(readCustomerHistory(store,input(),()=>assert.fail('no network')),/customer_history_unavailable/);
});
test('Woo signed responses reject foreign, partial, stale or inconsistent native facts',async t=>{
  const {store}=fixture(t,wooSource);
  const changes=[p=>p.shopId='foreign',p=>p.operation='customer_prices',p=>p.requestHash='f'.repeat(64),
    p=>p.history.schema='magento-customer-history-v1',p=>p.history.blog_id=2,p=>p.history.customer_id=8,
    p=>p.history.customer_email='other@example.test',p=>p.history.complete=false,p=>p.history.order_count=true,
    p=>p.history.order_storage='custom',p=>p.history.customer_created_at='2020-02-30 00:00:00',
    p=>p.history.read_at='2020-01-01T00:00:00Z',p=>p.history.orders=[],p=>p.history.address='private',
    p=>p.history.orders[0].total=48,p=>p.history.orders[0].total='NaN',p=>p.history.orders[0].total='-1',
    p=>p.history.orders[0].date_paid_gmt=false,p=>p.history.orders[0].date_paid_gmt='2020-02-30 00:00:00',
    p=>p.history.orders[0].currency='eur',p=>p.history.orders[0].items[0].product_id=true,
    p=>p.history.orders[0].items[0].quantity='-2',p=>p.history.orders[0].items[0].line_total='1e2',
    p=>p.history.orders[0].items[0].refunded_item_id='12',p=>p.history.orders[0].items.push(p.history.orders[0].items[0]),
    p=>p.history.orders[0].refunds[0].refund_id='1',p=>p.history.orders[0].refunds[0].amount='-24',
    p=>p.history.orders[0].refunds[0].payment_refunded='yes',p=>p.history.orders[0].refunds[0].items[0].quantity='1',
    p=>p.history.orders[0].refunds[0].items[0].refunded_item_id='999',p=>p.history.orders[0].refunds[0].items[0].variation_id='0',
    p=>{p.history.orders.push(p.history.orders[0]);p.history.order_count=2;}];
  for(const change of changes)await assert.rejects(readCustomerHistory(store,wooInput(),wooTransport(change)),/customer_history_unavailable/);
  for(const state of ['granted','denied','unknown']) {const h=wooHistory();h.marketing_consent=state;assert.equal(validateCustomerHistory(h,wooInput()).marketing_consent,state);}
});
test('Woo history budgets, response replay and current source/installation binding remain strict',async t=>{
  const {store,sync}=fixture(t,wooSource);let previous;
  await readCustomerHistory(store,wooInput(),async(...args)=>{previous=await wooTransport()(...args);return previous;});
  for(const value of [previous,{...previous,signature:'0'.repeat(64)},{...previous,body:Buffer.alloc(65537)}])
    await assert.rejects(readCustomerHistory(store,wooInput(),async()=>value),/customer_history_unavailable/);
  for(const kind of ['orders','refunds','items','bytes']) {
    const h=wooHistory();
    if(kind==='orders'){h.orders=Array.from({length:129},(_,i)=>({...h.orders[0],order_id:String(i+100)}));h.order_count=129;}
    if(kind==='refunds')h.orders[0].refunds=Array.from({length:129},(_,i)=>({...h.orders[0].refunds[0],refund_id:String(i+100),items:[]}));
    if(kind==='items'||kind==='bytes'){
      h.orders[0].refunds=[];h.orders[0].items=Array.from({length:kind==='items'?513:512},(_,i)=>({...h.orders[0].items[0],item_id:String(i+100)}));
    }
    assert.throws(()=>validateCustomerHistory(h,wooInput()),/customer_history_unavailable/);
  }
  await assert.rejects(readCustomerHistory(store,wooInput(),wooTransport(()=>{},()=>{
    sync.configure({...wooSource,secret:'cd'.repeat(32)});store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  })),/customer_history_unavailable/);
  sync.configure(wooSource);store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  await assert.rejects(readCustomerHistory(store,wooInput(),wooTransport(()=>{},()=>store.db.prepare("UPDATE meta SET value='foreign' WHERE name='installation_id'").run())),/customer_history_unavailable/);
});
