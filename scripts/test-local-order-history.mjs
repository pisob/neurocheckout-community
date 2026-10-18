import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {LocalDataStore,initializeLocalData} from './local-data-store.mjs';
import {SourceSynchronizer} from './local-source-sync.mjs';
import {LocalOrderHistory,refreshOrderHistory,HISTORY_INTERVAL_MS} from './local-order-history.mjs';
import {readHistoryIndex,validateHistoryIndex} from './customer-history-index.mjs';
import {sourceResponseSignature} from './source-pull-client.mjs';

const installationId='11111111-1111-4111-8111-111111111111';
const source={endpoint:'https://shop.example.invalid/wp-json/neurocheckout/v1/communitydata',secret:'ab'.repeat(32)};
const person=n=>({blogId:'1',customerId:String(n),customerEmail:`private-${n}@example.invalid`});
function fixture(t) {
  let now=Date.now();
  const directory=mkdtempSync(resolve(tmpdir(),'nc-history-'));
  initializeLocalData(directory,'fixture','staging');
  let store;
  const reopen=()=>{store?.close();store=new LocalDataStore(directory,()=>now,'staging');return store;};
  reopen();store.bindInstallation(installationId);new SourceSynchronizer(store).configure(source);
  const fresh=()=>store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=?,last_success_at=?').run(now,now);
  fresh();t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return {get store(){return store;},directory,reopen,fresh,advance(ms){now+=ms;fresh();},get now(){return now;}};
}
function readers(f,count=10) {
  const seen=[],indexes=[];
  return {seen,indexes,
    readIndex:async(_store,{afterId,ceilingId})=>{
      indexes.push([afterId,ceilingId]);
      const customers=Array.from({length:count},(_,i)=>person(i+1)).filter(p=>+p.customerId>+afterId).slice(0,8);
      return {ceiling_id:ceilingId??String(count),customers,complete:+afterId+8>=count};
    },
    readHistory:async(_store,request)=>{seen.push(request.customerId);return {shopId:'fixture',installationId,
      history:{complete:true,read_at:new Date(f.now).toISOString(),order_count:1,orders:[{private_fact:'historical-line-without-cart'}]}};},
  };
}

test('initial pass resumes after restart, stores encrypted accounts and runs again only when the week is due',async t=>{
  const f=fixture(t),deps=readers(f);
  for(let i=0;i<10;i++) {
    const result=await refreshOrderHistory(f.store,deps);assert.equal(result.ok,true);
    if(i===3)f.reopen();f.advance(1000);
  }
  assert.deepEqual(deps.seen,Array.from({length:10},(_,i)=>String(i+1)));
  assert.deepEqual(deps.indexes,[['0',null],['8','10']]);
  let cache=new LocalOrderHistory(f.store),status=cache.status();
  assert.equal(status.accounts,10);assert.ok(status.completeAt);assert.equal(status.nextDueAt-status.completeAt,HISTORY_INTERVAL_MS);
  const row=f.store.db.prepare('SELECT * FROM order_history_accounts LIMIT 1').get();
  assert.equal(cache.open(row.reference,row.ciphertext).history.orders[0].private_fact,'historical-line-without-cart');
  for(const row of f.store.db.prepare('SELECT ciphertext FROM order_history_accounts UNION ALL SELECT ciphertext FROM order_history_sync').all()) {
    assert.equal(Buffer.from(row.ciphertext).includes(Buffer.from('example.invalid')),false);
    assert.equal(Buffer.from(row.ciphertext).includes(Buffer.from('historical-line')),false);
  }
  assert.equal((await refreshOrderHistory(f.store,deps)).idle,true);
  f.advance(HISTORY_INTERVAL_MS-2000);assert.equal((await refreshOrderHistory(f.store,deps)).idle,true);
  f.advance(1000);assert.equal((await refreshOrderHistory(f.store,deps)).ok,true);
  assert.equal(deps.seen.length,11);assert.deepEqual(deps.indexes.at(-1),['0',null]);
});

test('failed account never advances cursor or completion and retries after durable backoff',async t=>{
  const f=fixture(t),deps=readers(f,2),real=deps.readHistory;
  deps.readHistory=async()=>{throw new Error('private customer detail');};
  assert.equal((await refreshOrderHistory(f.store,deps)).ok,false);
  let cache=new LocalOrderHistory(f.store);assert.equal(cache.status().completeAt,null);assert.equal(cache.status().accounts,0);
  assert.equal(cache.status().error,'history_refresh_unavailable');
  f.reopen();f.advance(29000);assert.equal((await refreshOrderHistory(f.store,deps)).idle,true);
  f.advance(1000);deps.readHistory=real;
  assert.equal((await refreshOrderHistory(f.store,deps)).ok,true);assert.deepEqual(deps.seen,['1']);
});

test('lease excludes concurrent workers and late results; binding rotation drops prior private snapshot',async t=>{
  const f=fixture(t),cache=new LocalOrderHistory(f.store),lease=cache.claim();
  assert.equal(cache.claim(),null);f.advance(60001);
  const successor=cache.claim();assert.ok(successor);
  assert.throws(()=>cache.finish(lease,lease.state));cache.failed(successor);
  f.advance(30000);await refreshOrderHistory(f.store,readers(f,1));assert.equal(cache.status().accounts,1);
  new SourceSynchronizer(f.store).configure({...source,secret:'cd'.repeat(32)});f.fresh();
  const rebound=cache.claim();assert.ok(rebound);assert.equal(cache.status().accounts,0);assert.equal(cache.status().completeAt,null);
});

test('source outage, cross-installation and cross-scope results cannot complete a pass',async t=>{
  const f=fixture(t),deps=readers(f,2);
  f.store.db.exec('UPDATE source_sync SET ready=0');
  assert.equal((await refreshOrderHistory(f.store,deps)).ok,false);assert.equal(deps.indexes.length,0);
  f.fresh();const read=deps.readHistory;deps.readHistory=async(...args)=>({...await read(...args),installationId:'foreign'});
  assert.equal((await refreshOrderHistory(f.store,deps)).ok,false);
  assert.equal(new LocalOrderHistory(f.store).status().accounts,0);
  f.advance(30000);deps.readHistory=read;await refreshOrderHistory(f.store,deps);f.advance(1000);
  const cache=new LocalOrderHistory(f.store),row=f.store.db.prepare('SELECT ciphertext FROM order_history_sync').get();
  const state=cache.open('state',row.ciphertext);state.pending[0].blogId='2';
  f.store.db.prepare('UPDATE order_history_sync SET ciphertext=?').run(cache.seal('state',state));
  assert.equal((await refreshOrderHistory(f.store,deps)).ok,false);assert.equal(cache.status().completeAt,null);
});

test('empty native index completes successfully without inventing a customer',async t=>{
  const f=fixture(t),deps=readers(f,0);
  assert.deepEqual(await refreshOrderHistory(f.store,deps),{ok:true,complete:true});
  assert.equal(deps.seen.length,0);assert.equal(new LocalOrderHistory(f.store).status().accounts,0);
});

test('signed index binds nonce, body, shop and monotonic pagination',async t=>{
  const f=fixture(t);
  const transport=async(_url,raw,headers)=>{
    const input=JSON.parse(raw),page={schema:1,shopId:'fixture',operation:'customer_history_index',
      requestHash:createHash('sha256').update(raw).digest('hex'),index:{read_at:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),
        after_id:'0',ceiling_id:'1',next_id:'1',complete:true,customers:[person(1)]}};
    const body=Buffer.from(JSON.stringify(page));
    for(const change of [{next_id:'0'},{ceiling_id:'0'},{complete:false},{customers:[person(1),person(1)]},{read_at:'2000-01-01T00:00:00Z'}]) {
      assert.throws(()=>validateHistoryIndex({...page,index:{...page.index,...change}},input,new URL(source.endpoint).pathname));
    }
    return {body,signature:sourceResponseSignature(source.secret,headers['X-NC-Source-Nonce'],body)};
  };
  assert.equal((await readHistoryIndex(f.store,{},transport)).customers.length,1);
  await assert.rejects(readHistoryIndex(f.store,{},async(...args)=>({...await transport(...args),signature:'0'.repeat(64)})));
});
