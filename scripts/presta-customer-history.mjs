// Native PrestaShop facts. Credits are not bank refunds; shared payments are not allocated.
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(?:0|[1-9][0-9]{0,9})$/:/^[1-9][0-9]{0,9}$/).test(v);
const email=v=>typeof v==='string'&&v.length<=254&&/^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/.test(v);
const decimal=(v,signed=false)=>typeof v==='string'&&(signed?/^-?\d{1,26}(?:\.\d{1,8})?$/:/^\d{1,26}(?:\.\d{1,8})?$/).test(v);
// Calendar validation only: native SQL DATETIME is local, not proven historic UTC.
const date=v=>typeof v==='string'&&/^[1-9]\d{3}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v.replace(' ','T')+'Z'))&&new Date(v.replace(' ','T')+'Z').toISOString().slice(0,19).replace('T',' ')===v;
const currency=v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
const fail=()=>{throw new Error('customer_history_unavailable');};
export function validatePrestaCustomerHistoryRequest(v) {
  if(!exact(v,['nativeShopId','customerId','customerEmail'])||!id(v.nativeShopId)||!id(v.customerId)||!email(v.customerEmail))fail();
  return v;
}
export function validatePrestaCustomerHistory(h,input,now=Date.now()) {
  validatePrestaCustomerHistoryRequest(input);
  if(!exact(h,['schema','native_shop_id','customer_id','customer_email','customer_created_at','native_timezone',
      'read_at','complete','order_count','orders','payments','marketing_consent'])||h.schema!=='prestashop-customer-history-v1'
      ||h.complete!==true||!Number.isSafeInteger(h.native_shop_id)||String(h.native_shop_id)!==input.nativeShopId
      ||!Number.isSafeInteger(h.customer_id)||String(h.customer_id)!==input.customerId||!email(h.customer_email)
      ||h.customer_email.toLowerCase()!==input.customerEmail.toLowerCase()||!date(h.customer_created_at)
      ||typeof h.native_timezone!=='string'||h.native_timezone.length>64||!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(h.native_timezone)
      ||!['granted','denied','unknown'].includes(h.marketing_consent)||typeof h.read_at!=='string'
      ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(h.read_at)||!date(h.read_at.slice(0,19).replace('T',' '))
      ||Math.abs(now-Date.parse(h.read_at))>15000||!Array.isArray(h.orders)||h.orders.length>128
      ||h.order_count!==h.orders.length||!Array.isArray(h.payments)||h.payments.length>128)fail();
  try{new Intl.DateTimeFormat('en',{timeZone:h.native_timezone});}catch{fail();}
  const orders=new Set(),items=new Set(),slips=new Set(),payments=new Set();let lines=0;
  const unique=(v,seen)=>{if(!id(v)||seen.has(v))fail();seen.add(v);};
  for(const order of h.orders) {
    if(!exact(order,['order_id','current_state_id','state_paid','state_logable','valid','created_at','updated_at','currency',
        'total_paid_tax_incl','total_paid_real','items','credit_slips'])||!id(order.current_state_id,true)||typeof order.valid!=='boolean'
        ||![order.state_paid,order.state_logable].every(v=>v===null||typeof v==='boolean')||!date(order.created_at)||!date(order.updated_at)
        ||!currency(order.currency)||!decimal(order.total_paid_tax_incl)||!(order.total_paid_real===null||decimal(order.total_paid_real,true))
        ||!Array.isArray(order.items)||!order.items.length||!Array.isArray(order.credit_slips))fail();
    unique(order.order_id,orders);const original=new Set();
    for(const line of order.items) {
      if(++lines>512||!exact(line,['item_id','product_id','attribute_id','quantity','quantity_refunded','quantity_returned','total_price_tax_incl','total_price_tax_excl'])
          ||!['product_id','attribute_id','quantity','quantity_refunded','quantity_returned'].every(k=>id(line[k],true))
          ||!decimal(line.total_price_tax_incl)||!decimal(line.total_price_tax_excl))fail();
      unique(line.item_id,items);original.add(line.item_id);
    }
    for(const slip of order.credit_slips) {
      if(!exact(slip,['slip_id','created_at','updated_at','type','total_products_tax_incl','total_shipping_tax_incl','items'])
          ||![0,1,2].includes(slip.type)||!date(slip.created_at)||!date(slip.updated_at)
          ||!decimal(slip.total_products_tax_incl)||!decimal(slip.total_shipping_tax_incl)||!Array.isArray(slip.items))fail();
      unique(slip.slip_id,slips);if(slips.size>128)fail();const seen=new Set();
      for(const line of slip.items) {
        if(++lines>512||!exact(line,['item_id','quantity','amount_tax_incl','amount_tax_excl'])||!original.has(line.item_id)
            ||!id(line.quantity,true)||![line.amount_tax_incl,line.amount_tax_excl].every(v=>v===null||decimal(v)))fail();
        unique(line.item_id,seen);
      }
    }
  }
  for(const p of h.payments) {
    if(!exact(p,['payment_id','created_at','amount','currency','conversion_rate','order_ids','invoice_order_ids'])
        ||!date(p.created_at)||!decimal(p.amount,true)||!currency(p.currency)||!decimal(p.conversion_rate)||!/[1-9]/.test(p.conversion_rate)
        ||!Array.isArray(p.order_ids)||!p.order_ids.length||p.order_ids.length>128
        ||!Array.isArray(p.invoice_order_ids)||p.invoice_order_ids.length>128)fail();
    unique(p.payment_id,payments);const seen=new Set(),invoices=new Set();
    for(const v of p.order_ids){unique(v,seen);if(!orders.has(v))fail();}
    for(const v of p.invoice_order_ids){unique(v,invoices);if(!seen.has(v))fail();}
  }
  if(Buffer.byteLength(JSON.stringify(h))>64000)fail();return h;
}
