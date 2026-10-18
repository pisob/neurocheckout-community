import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {SourceSynchronizer,connectorEndpoint} from './local-source-sync.mjs';
import {postSourcePage,sourceRequestSignature,sourceResponseSignature} from './source-pull-client.mjs';
import {validateCustomerHistoryRequest} from './customer-history-reader.mjs';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=v=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,9})$/.test(v);
const fail=()=>{throw new Error('customer_history_index_unavailable');};
export function historyBinding(store) {
  const config=new SourceSynchronizer(store).configuration();
  const installationId=store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
  if(!installationId)fail();
  return {config,installationId};
}
export function validateHistoryIndex(page,input,path,now=Date.now()) {
  const h=page?.index;
  if(!exact(page,['schema','shopId','operation','requestHash','index'])||page.schema!==1||page.shopId!==input.shopId
      ||page.operation!=='customer_history_index'||page.requestHash!==createHash('sha256').update(JSON.stringify(input)).digest('hex')
      ||!exact(h,['read_at','after_id','ceiling_id','next_id','complete','customers'])||h.after_id!==input.afterId
      ||!id(h.ceiling_id)||!id(h.next_id)||Number(h.ceiling_id)<Number(h.next_id)
      ||(input.ceilingId!==null&&h.ceiling_id!==input.ceilingId)||typeof h.complete!=='boolean'
      ||typeof h.read_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(h.read_at)
      ||!Number.isFinite(Date.parse(h.read_at))||Math.abs(now-Date.parse(h.read_at))>15000
      ||!Array.isArray(h.customers)||h.customers.length>8||(!h.complete&&h.customers.length!==8))fail();
  const scopeKey=path.endsWith('/module/neurocheckoutconnector/communitydata')?'nativeShopId'
    :path.endsWith('/wp-json/neurocheckout/v1/communitydata')?'blogId':'storeId';
  let previous=input.afterId,scope;
  for(const person of h.customers) {
    validateCustomerHistoryRequest(person);
    if(!Object.hasOwn(person,scopeKey)||Number(person.customerId)<=Number(previous)||Number(person.customerId)>Number(h.ceiling_id))fail();
    const current=JSON.stringify([person[scopeKey],person.websiteId]);
    if(scope!==undefined&&scope!==current)fail();
    scope=current;previous=person.customerId;
  }
  if(previous!==h.next_id)fail();
  return h;
}

export async function readHistoryIndex(store,{afterId='0',ceilingId=null},transport=postSourcePage) {
  try {
    if(!id(afterId)||(ceilingId===null?afterId!=='0':!id(ceilingId)||Number(ceilingId)<Number(afterId)))fail();
    store.requireSourceFresh();
    const before=historyBinding(store),{config}=before,path=connectorEndpoint(config.endpoint).pathname;
    const input={schema:1,shopId:store.config.shopId,operation:'customer_history_index',afterId,ceilingId,limit:8};
    const body=JSON.stringify(input),nonce=randomBytes(16).toString('hex'),timestamp=String(Date.now());
    const response=await transport(config.endpoint,body,{'Content-Type':'application/json','Cache-Control':'no-store',
      'X-NC-Source-Time':timestamp,'X-NC-Source-Nonce':nonce,
      'X-NC-Source-Signature':sourceRequestSignature(config.secret,path,store.config.shopId,timestamp,nonce,body)},
      {signal:AbortSignal.timeout(6000),maxBytes:65536});
    if(!Buffer.isBuffer(response.body)||response.body.length>65536||typeof response.signature!=='string'
        ||!/^[a-f0-9]{64}$/.test(response.signature)||!timingSafeEqual(Buffer.from(response.signature,'hex'),
          Buffer.from(sourceResponseSignature(config.secret,nonce,response.body),'hex')))fail();
    const index=validateHistoryIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(response.body)),input,path);
    store.requireSourceFresh();
    if(JSON.stringify(historyBinding(store))!==JSON.stringify(before))fail();
    return index;
  } catch {fail();}
}
