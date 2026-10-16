// Native facts only. No history, identity or consent is persisted by this read.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {SourceSynchronizer,connectorEndpoint} from './local-source-sync.mjs';
import {postSourcePage,sourceRequestSignature,sourceResponseSignature} from './source-pull-client.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=v=>typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v);
const decimal=v=>typeof v==='string'&&/^\d{1,10}(?:\.\d{1,4})?$/.test(v);
const email=v=>typeof v==='string'&&v.length<=254&&/^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/.test(v);
const fail=()=>{throw new Error('customer_history_unavailable');};
const date=(v,now)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v.replace(' ','T')+'Z'))&&Date.parse(v.replace(' ','T')+'Z')<=now+15000
  &&new Date(v.replace(' ','T')+'Z').toISOString().slice(0,19).replace('T',' ')===v;
export function validateCustomerHistoryRequest(input) {
  if(!exact(input,['storeId','websiteId','customerId','customerEmail'])
      ||!['storeId','websiteId','customerId'].every(k=>id(input[k]))||!email(input.customerEmail))fail();
  return input;
}
export function validateCustomerHistory(h,input,now=Date.now()) {
  validateCustomerHistoryRequest(input);
  if(!exact(h,['schema','store_id','website_id','customer_id','customer_email','customer_group_id',
      'customer_created_at','read_at','complete','order_count','orders','marketing_consent'])
      ||h.schema!=='magento-customer-history-v1'||h.complete!==true
      ||![['store_id','storeId'],['website_id','websiteId'],['customer_id','customerId']].every(([a,b])=>Number.isSafeInteger(h[a])&&String(h[a])===input[b])
      ||!email(h.customer_email)||h.customer_email.toLowerCase()!==input.customerEmail.toLowerCase()
      ||!Number.isSafeInteger(h.customer_group_id)||h.customer_group_id<0||h.customer_group_id>9999999999
      ||!date(h.customer_created_at,now)||!['granted','denied','unknown'].includes(h.marketing_consent)
      ||typeof h.read_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(h.read_at)
      ||!Number.isFinite(Date.parse(h.read_at))||Math.abs(now-Date.parse(h.read_at))>15000
      ||!Array.isArray(h.orders)||h.orders.length>128||h.order_count!==h.orders.length)fail();
  const orders=new Set(),allItems=new Set();let count=0;
  for(const o of h.orders) {
    if(!exact(o,['order_id','state','status','created_at','updated_at','currency','grand_total','total_paid','total_refunded','items'])
        ||!id(o.order_id)||orders.has(o.order_id)||!['state','status'].every(k=>typeof o[k]==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(o[k]))
        ||!date(o.created_at,now)||!date(o.updated_at,now)||typeof o.currency!=='string'||!/^[A-Z]{3}$/.test(o.currency)
        ||!decimal(o.grand_total)||![o.total_paid,o.total_refunded].every(v=>v===null||decimal(v))
        ||!Array.isArray(o.items)||!o.items.length)fail();
    orders.add(o.order_id);const items=new Map();
    for(const item of o.items) {
      if(++count>512||!exact(item,['item_id','parent_item_id','product_id','product_type','qty_ordered','qty_invoiced','qty_refunded','qty_canceled'])
          ||!id(item.item_id)||allItems.has(item.item_id)||![item.product_id,item.parent_item_id].every(v=>v===null||id(v))
          ||typeof item.product_type!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(item.product_type)
          ||!['qty_ordered','qty_invoiced','qty_refunded','qty_canceled'].every(k=>decimal(item[k])))fail();
      items.set(item.item_id,item);allItems.add(item.item_id);
    }
    for(const item of items.values())if(item.parent_item_id!==null&&(!items.has(item.parent_item_id)
      ||item.parent_item_id===item.item_id||items.get(item.parent_item_id).parent_item_id!==null))fail();
  }
  if(Buffer.byteLength(JSON.stringify(h))>64000)fail();
  return h;
}
const sourceTransport=(endpoint,body,headers)=>postSourcePage(endpoint,body,headers,{signal:AbortSignal.timeout(6000),maxBytes:65536});
export async function readCustomerHistory(store,request,transport=sourceTransport) {
  try {
    const input=structuredClone(validateCustomerHistoryRequest(request));
    store.requireSourceFresh();
    const installationId=store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
    if(!installationId)fail();
    const sync=new SourceSynchronizer(store),config=sync.configuration(),path=connectorEndpoint(config.endpoint).pathname;
    if(!/\/neurocheckout\/community\/pull$/.test(path))fail();
    const body=JSON.stringify({schema:1,shopId:store.config.shopId,operation:'customer_history',...input});
    if(Buffer.byteLength(body)>2048)fail();
    const nonce=randomBytes(16).toString('hex'),timestamp=String(Date.now());
    const response=await transport(config.endpoint,body,{
      'Content-Type':'application/json','Cache-Control':'no-store','X-NC-Source-Time':timestamp,'X-NC-Source-Nonce':nonce,
      'X-NC-Source-Signature':sourceRequestSignature(config.secret,path,store.config.shopId,timestamp,nonce,body),
    });
    if(!Buffer.isBuffer(response.body)||response.body.length>65536||typeof response.signature!=='string'
        ||!/^[a-f0-9]{64}$/.test(response.signature)||!timingSafeEqual(Buffer.from(response.signature,'hex'),
          Buffer.from(sourceResponseSignature(config.secret,nonce,response.body),'hex')))fail();
    const page=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(response.body));
    if(!exact(page,['schema','shopId','operation','requestHash','history'])||page.schema!==1
        ||page.shopId!==store.config.shopId||page.operation!=='customer_history'
        ||page.requestHash!==createHash('sha256').update(body).digest('hex'))fail();
    const history=validateCustomerHistory(page.history,input);
    store.requireSourceFresh();
    const current=sync.configuration();
    if(current.endpoint!==config.endpoint||current.secret!==config.secret
        ||store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value!==installationId)fail();
    return {schema:1,shopId:store.config.shopId,installationId,history};
  } catch {fail();}
}
