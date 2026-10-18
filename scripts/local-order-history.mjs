// Historical snapshots stay in this encrypted vault. They are never a fresh
// consent/price proof: the email path must still perform its live native reads.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {LocalDataStore,mac} from './local-data-store.mjs';
import {historyBinding,readHistoryIndex} from './customer-history-index.mjs';
import {readCustomerHistory} from './customer-history-reader.mjs';

export const HISTORY_INTERVAL_MS=7*86400_000;
const MAX_BYTES=128*1024*1024,MAX_ACCOUNTS=10000;
const fail=()=>{throw new Error('local_order_history_unavailable');};

export class LocalOrderHistory {
  constructor(store) {
    this.store=store;this.db=store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS order_history_sync (
      id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL, ciphertext BLOB NOT NULL,
      next_due INTEGER NOT NULL DEFAULT 0,last_complete INTEGER NOT NULL DEFAULT 0,
      lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE TABLE IF NOT EXISTS order_history_accounts (
      reference TEXT PRIMARY KEY,cycle TEXT NOT NULL,read_at INTEGER NOT NULL,ciphertext BLOB NOT NULL);`);
    this.db.prepare('DELETE FROM order_history_accounts WHERE read_at<?').run(store.clock()-30*86400_000);
  }
  binding() { return mac(this.store.config.encryptionKey,JSON.stringify(historyBinding(this.store))); }
  seal(reference,value) {
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(this.store.config.encryptionKey,'hex'),iv);
    cipher.setAAD(Buffer.from(`order-history-v1:${this.store.config.shopId}:${reference}`));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  }
  open(reference,raw) {
    const data=Buffer.from(raw),cipher=createDecipheriv('aes-256-gcm',Buffer.from(this.store.config.encryptionKey,'hex'),data.subarray(0,12));
    cipher.setAAD(Buffer.from(`order-history-v1:${this.store.config.shopId}:${reference}`));cipher.setAuthTag(data.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));
  }
  claim() {
    this.store.requireSourceFresh();
    const binding=this.binding(),now=this.store.clock();
    return this.store.transaction(()=>{
      let row=this.db.prepare('SELECT * FROM order_history_sync WHERE id=1').get();
      if(row?.lease_until>now)return null;
      if(row&&row.binding!==binding) {
        this.db.exec('DELETE FROM order_history_sync; DELETE FROM order_history_accounts;');row=null;
      }
      if(!row) {
        this.db.prepare('INSERT INTO order_history_sync(id,binding,ciphertext) VALUES(1,?,?)').run(binding,this.seal('state',null));
        row=this.db.prepare('SELECT * FROM order_history_sync WHERE id=1').get();
      }
      if(row.next_due>now)return null;
      const state=this.open('state',row.ciphertext)??{cycle:randomBytes(16).toString('hex'),afterId:'0',ceilingId:null,pending:[],pageComplete:false,scope:null};
      const token=randomBytes(16).toString('hex');
      this.db.prepare('UPDATE order_history_sync SET ciphertext=?,lease=?,lease_until=? WHERE id=1')
        .run(this.seal('state',state),token,now+60000);
      return {token,binding,state};
    });
  }
  finish(lease,state,account=null,complete=false) {
    this.store.requireSourceFresh();
    if(this.binding()!==lease.binding)fail();
    this.store.transaction(()=>{
      const now=this.store.clock(),row=this.db.prepare('SELECT * FROM order_history_sync WHERE id=1').get();
      if(row?.lease!==lease.token||row.lease_until<=now||row.binding!==lease.binding)fail();
      if(account) {
        const reference=mac(this.store.config.encryptionKey,JSON.stringify(['order-account-v1',account.request]));
        const ciphertext=this.seal(reference,account);
        if(ciphertext.length>68000)fail();
        this.db.prepare('INSERT INTO order_history_accounts VALUES(?,?,?,?) ON CONFLICT(reference) DO UPDATE SET cycle=excluded.cycle,read_at=excluded.read_at,ciphertext=excluded.ciphertext')
          .run(reference,state.cycle,Date.parse(account.history.read_at),ciphertext);
        const size=this.db.prepare('SELECT count(*) n,coalesce(sum(length(ciphertext)),0) bytes FROM order_history_accounts').get();
        if(size.n>MAX_ACCOUNTS||size.bytes>MAX_BYTES)fail();
      }
      if(complete)this.db.prepare('DELETE FROM order_history_accounts WHERE cycle<>?').run(state.cycle);
      // No timer can mark a partial/failed pass complete. Cursor and payload
      // advance together, so a process loss simply retries the uncommitted item.
      this.db.prepare('UPDATE order_history_sync SET ciphertext=?,next_due=?,last_complete=?,lease=NULL,lease_until=0,error=NULL WHERE id=1')
        .run(this.seal('state',complete?null:state),complete?now+HISTORY_INTERVAL_MS:now+1000,complete?now:row.last_complete);
    });
  }
  failed(lease) {
    this.db.prepare("UPDATE order_history_sync SET lease=NULL,lease_until=0,next_due=?,error='history_refresh_unavailable' WHERE id=1 AND lease=?")
      .run(this.store.clock()+30000,lease.token);
  }
  status() {
    const row=this.db.prepare('SELECT last_complete,next_due,error FROM order_history_sync WHERE id=1').get();
    const count=this.db.prepare('SELECT count(*) n FROM order_history_accounts').get().n;
    return {completeAt:row?.last_complete||null,nextDueAt:row?.next_due||null,error:row?.error||null,accounts:count};
  }
  completionReport() {
    // Report only a committed whole pass for the current source/installation.
    // In particular, an old last_complete beside a new partial pass is not a
    // fresh success. Only counts/timestamps leave the vault, never its orders.
    const row=this.db.prepare('SELECT * FROM order_history_sync WHERE id=1').get();
    const now=this.store.clock();
    if(!row||row.binding!==this.binding()||row.error||row.lease||!row.last_complete
        ||row.last_complete>now||now-row.last_complete>=HISTORY_INTERVAL_MS
        ||row.next_due!==row.last_complete+HISTORY_INTERVAL_MS
        ||this.open('state',row.ciphertext)!==null)return null;
    return {schema:1,installation_id:historyBinding(this.store).installationId,
      completed_at_ms:row.last_complete,next_due_at_ms:row.next_due,
      accounts:this.db.prepare('SELECT count(*) n FROM order_history_accounts').get().n};
  }
}

export function orderHistoryCompletion(options) {
  let store;
  try {
    const environment=options.environment??process.env.NC_DEPLOYMENT_ENV;
    if(!['staging','production'].includes(environment))return null;
    store=new LocalDataStore(options.directory,Date.now,environment);
    return new LocalOrderHistory(store).completionReport();
  } catch {return null;} finally {store?.close();}
}

export async function refreshOrderHistory(store,{readIndex=readHistoryIndex,readHistory=readCustomerHistory}={}) {
  const cache=new LocalOrderHistory(store);let lease;
  try {
    lease=cache.claim();if(!lease)return {ok:true,idle:true};
    const state=structuredClone(lease.state);
    if(!state.pending.length) {
      const page=await readIndex(store,{afterId:state.afterId,ceilingId:state.ceilingId});
      state.ceilingId=page.ceiling_id;state.pending=page.customers;state.pageComplete=page.complete;
      if(!state.pending.length) {cache.finish(lease,state,null,page.complete);return {ok:true,complete:page.complete};}
    }
    const request=state.pending[0];
    const scope=JSON.stringify([request.nativeShopId,request.blogId,request.storeId,request.websiteId]);
    if(state.scope!==null&&state.scope!==scope)fail();state.scope=scope;
    const result=await readHistory(store,request);
    if(result.shopId!==store.config.shopId||result.installationId!==historyBinding(store).installationId
        ||result.history.complete!==true||!Number.isFinite(Date.parse(result.history.read_at)))fail();
    state.afterId=request.customerId;state.pending.shift();
    const complete=state.pageComplete&&!state.pending.length;
    cache.finish(lease,state,{request,history:result.history},complete);
    return {ok:true,complete};
  } catch {if(lease)cache.failed(lease);return {ok:false,code:'history_refresh_unavailable'};}
}

export async function refreshOrderHistoryOnce(options) {
  let store;
  try {
    if(options.enabled!==true||!['staging','production'].includes(options.environment))return {ok:false};
    store=new LocalDataStore(options.directory,Date.now,options.environment);
    return await refreshOrderHistory(store);
  } catch {return {ok:false,code:'history_refresh_unavailable'};}
  finally {store?.close();}
}

export function startOrderHistoryLoop(options,active=()=>true) {
  const tick=async()=>{
    if(!active())return;
    const result=await refreshOrderHistoryOnce(options);
    if(active())setTimeout(tick,result.ok?(result.idle||result.complete?30000:1000):30000).unref();
  };
  setTimeout(tick,1500).unref();
}
