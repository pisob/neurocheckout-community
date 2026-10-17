// Transport validation only; no pricing rules, profile or sending decisions.
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=v=>typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v);
const email=v=>typeof v==='string'&&v.length<=254&&/^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/.test(v);
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9;
const fail=()=>{throw new Error('customer_prices_unavailable');};
export function validateWooCustomerPriceRequest(v){
  if(!exact(v,['blogId','customerId','customerEmail','productIds','currency'])||!id(v.blogId)||!id(v.customerId)||!email(v.customerEmail)
      ||typeof v.currency!=='string'||!/^[A-Z]{3}$/.test(v.currency)||!Array.isArray(v.productIds)||v.productIds.length<1
      ||v.productIds.length>16||!v.productIds.every(id)||new Set(v.productIds).size!==v.productIds.length)fail();
  return v;
}
export function validateWooCustomerPrices(p,input,now=Date.now()){
  validateWooCustomerPriceRequest(input);
  if(!exact(p,['schema','blog_id','customer_id','customer_email','currency','quantity','price_decimals','context_hash','read_at','offers'])
      ||p.schema!=='woocommerce-customer-prices-v1'||!Number.isSafeInteger(p.blog_id)||String(p.blog_id)!==input.blogId
      ||!Number.isSafeInteger(p.customer_id)||String(p.customer_id)!==input.customerId||!email(p.customer_email)
      ||p.customer_email.toLowerCase()!==input.customerEmail.toLowerCase()||p.currency!==input.currency||p.quantity!==1
      ||!Number.isSafeInteger(p.price_decimals)||p.price_decimals<0||p.price_decimals>6||typeof p.context_hash!=='string'
      ||!/^[a-f0-9]{64}$/.test(p.context_hash)||typeof p.read_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.read_at)
      ||!Number.isFinite(Date.parse(p.read_at))||Math.abs(now-Date.parse(p.read_at))>15000
      ||new Date(p.read_at).toISOString().replace('.000Z','Z')!==p.read_at
      ||!Array.isArray(p.offers)||p.offers.length!==input.productIds.length)fail();
  for(const [i,o] of p.offers.entries()){
    if(o?.product_id!==input.productIds[i])fail();
    if(o.status==='unavailable'){if(!exact(o,['product_id','status']))fail();continue;}
    if(!exact(o,['product_id','status','currency','price_excl_tax','price_incl_tax','display_mode','display_price'])
        ||o.status!=='available'||o.currency!==input.currency||!['including_tax','excluding_tax'].includes(o.display_mode)
        ||!['price_excl_tax','price_incl_tax','display_price'].every(k=>money(o[k])))fail();
    const raw=o[o.display_mode==='including_tax'?'price_incl_tax':'price_excl_tax'],scale=10**p.price_decimals;
    // Validate native rounding without reimplementing PHP's midpoint semantics.
    if(Math.abs(o.display_price-raw)>.5/scale+1e-8||Math.abs(o.display_price-Math.round(o.display_price*scale)/scale)>1e-8)fail();
  }
  return p;
}
