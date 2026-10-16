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
