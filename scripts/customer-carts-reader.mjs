// A complete native account-cart read, transported in memory without a vault write.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {SourceSynchronizer,connectorEndpoint} from './local-source-sync.mjs';
import {postSourcePage,sourceRequestSignature,sourceResponseSignature} from './source-pull-client.mjs';
import {validateCustomerHistoryRequest} from './customer-history-reader.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const fail=()=>{throw new Error('customer_carts_unavailable');};
export function validateCustomerCartsRequest(input) {
  try{return validateCustomerHistoryRequest(input);}catch{fail();}
}
export function validateCustomerCarts(carts,input,now=Date.now()) {
  validateCustomerCartsRequest(input);
  const platform=Object.hasOwn(input,'nativeShopId')?'prestashop':Object.hasOwn(input,'blogId')?'woocommerce':'magento';
  if(!exact(carts,['schema','identity','read_at','complete','has_active_cart','marketing_consent'])
    ||carts.schema!==`${platform}-customer-carts-v1`||carts.complete!==true||typeof carts.has_active_cart!=='boolean'
    ||!exact(carts.identity,Object.keys(input))||!['granted','denied','unknown'].includes(carts.marketing_consent)
    ||typeof carts.read_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(carts.read_at)
    ||!Number.isFinite(Date.parse(carts.read_at))||Math.abs(now-Date.parse(carts.read_at))>15000
    ||new Date(carts.read_at).toISOString().replace('.000Z','Z')!==carts.read_at)fail();
  validateCustomerCartsRequest(carts.identity);
  for(const key of Object.keys(input))if(key==='customerEmail'
    ?carts.identity[key].toLowerCase()!==input[key].toLowerCase():carts.identity[key]!==input[key])fail();
  return carts;
}
const sourceTransport=(endpoint,body,headers)=>postSourcePage(endpoint,body,headers,{signal:AbortSignal.timeout(6000),maxBytes:4096});
export async function readCustomerCarts(store,request,transport=sourceTransport) {
  try {
    const input=structuredClone(validateCustomerCartsRequest(request));
    store.requireSourceFresh();
    const shopId=store.config.shopId;
    const installationId=store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
    if(!installationId)fail();
    const sync=new SourceSynchronizer(store),config=sync.configuration(),path=connectorEndpoint(config.endpoint).pathname;
    const allowedPath=Object.hasOwn(input,'nativeShopId')?/\/module\/neurocheckoutconnector\/communitydata$/:Object.hasOwn(input,'blogId')
      ?/\/wp-json\/neurocheckout\/v1\/communitydata$/:/\/neurocheckout\/community\/pull$/;
    if(!allowedPath.test(path))fail();
    const body=JSON.stringify({schema:1,shopId,operation:'customer_carts',...input});
    if(Buffer.byteLength(body)>2048)fail();
    const nonce=randomBytes(16).toString('hex'),timestamp=String(Date.now());
    const response=await transport(config.endpoint,body,{
      'Content-Type':'application/json','Cache-Control':'no-store','X-NC-Source-Time':timestamp,'X-NC-Source-Nonce':nonce,
      'X-NC-Source-Signature':sourceRequestSignature(config.secret,path,shopId,timestamp,nonce,body),
    });
    if(Date.now()-Number(timestamp)>6000||!Buffer.isBuffer(response.body)||response.body.length>4096
      ||typeof response.signature!=='string'||!/^[a-f0-9]{64}$/.test(response.signature)
      ||!timingSafeEqual(Buffer.from(response.signature,'hex'),Buffer.from(sourceResponseSignature(config.secret,nonce,response.body),'hex')))fail();
    const page=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(response.body));
    if(!exact(page,['schema','shopId','operation','requestHash','carts'])||page.schema!==1||page.shopId!==shopId
      ||page.operation!=='customer_carts'||page.requestHash!==createHash('sha256').update(body).digest('hex'))fail();
    const carts=validateCustomerCarts(page.carts,input);
    store.requireSourceFresh();
    const current=sync.configuration();
    if(current.endpoint!==config.endpoint||current.secret!==config.secret||store.config.shopId!==shopId
      ||store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value!==installationId)fail();
    return {schema:1,shopId,installationId,carts};
  }catch{fail();}
}
