// Native WooCommerce facts. These validators never classify purchases or consent.
import {legacyHistoryFacts} from './native-history-v2.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(?:0|[1-9][0-9]{0,9})$/:/^[1-9][0-9]{0,9}$/).test(v);
const email=v=>typeof v==='string'&&v.length<=254&&/^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/.test(v);
const decimal=(v,refund=false)=>typeof v==='string'
  &&(refund?/^-?\d{1,26}(?:\.\d{1,8})?$/:/^\d{1,26}(?:\.\d{1,8})?$/).test(v)
  &&(!refund||v.startsWith('-')||!/[1-9]/.test(v));
const date=(v,now)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)
  &&Number.isFinite(Date.parse(v.replace(' ','T')+'Z'))&&Date.parse(v.replace(' ','T')+'Z')<=now+15000
  &&new Date(v.replace(' ','T')+'Z').toISOString().slice(0,19).replace('T',' ')===v;
const fail=()=>{throw new Error('customer_history_unavailable');};

export function validateWooCustomerHistoryRequest(v) {
  if(!exact(v,['blogId','customerId','customerEmail'])||!id(v.blogId)||!id(v.customerId)||!email(v.customerEmail))fail();
  return v;
}

export function validateWooCustomerHistory(h,input,now=Date.now()) {
  const native=h;h=legacyHistoryFacts(h,'woocommerce-customer-history-v1');
  validateWooCustomerHistoryRequest(input);
  if(!exact(h,['schema','blog_id','customer_id','customer_email','customer_created_at','read_at','complete',
      'order_storage','order_count','orders','marketing_consent'])||h.schema!=='woocommerce-customer-history-v1'
      ||h.complete!==true||!Number.isSafeInteger(h.blog_id)||String(h.blog_id)!==input.blogId
      ||!Number.isSafeInteger(h.customer_id)||String(h.customer_id)!==input.customerId
      ||!email(h.customer_email)||h.customer_email.toLowerCase()!==input.customerEmail.toLowerCase()
      ||!['posts','hpos'].includes(h.order_storage)||!['granted','denied','unknown'].includes(h.marketing_consent)
      ||!date(h.customer_created_at,now)||typeof h.read_at!=='string'
      ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(h.read_at)||!Number.isFinite(Date.parse(h.read_at))
      ||Math.abs(now-Date.parse(h.read_at))>15000||!date(h.read_at.slice(0,19).replace('T',' '),now)
      ||!Array.isArray(h.orders)||h.orders.length>128||h.order_count!==h.orders.length)fail();
  const ids=new Set(),lineIds=new Set();let refundCount=0;
  const unique=(value,seen)=>{if(!id(value)||seen.has(value))fail();seen.add(value);};
  const items=(lines,refund,originals)=>{
    if(!Array.isArray(lines))fail();
    const result=new Map();
    for(const line of lines) {
      if(!exact(line,['item_id','product_id','variation_id','quantity','line_total','line_tax','refunded_item_id'])
          ||!id(line.product_id,true)||!id(line.variation_id,true)
          ||!['quantity','line_total','line_tax'].every(k=>decimal(line[k],refund)))fail();
      unique(line.item_id,lineIds);if(lineIds.size>512)fail();
      const parent=line.refunded_item_id;
      if(!refund&&parent!==null)fail();
      if(refund&&parent!==null&&(!id(parent)||!originals.has(parent)
          ||originals.get(parent).product_id!==line.product_id||originals.get(parent).variation_id!==line.variation_id))fail();
      result.set(line.item_id,line);
    }
    return result;
  };
  for(const order of h.orders) {
    if(!exact(order,['order_id','status','created_at','updated_at','currency','total','date_paid_gmt','items','refunds'])
        ||typeof order.status!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(order.status)
        ||typeof order.currency!=='string'||!/^[A-Z]{3}$/.test(order.currency)||!decimal(order.total)
        ||!date(order.created_at,now)||!date(order.updated_at,now)
        ||!(order.date_paid_gmt===null||date(order.date_paid_gmt,now))||!Array.isArray(order.refunds))fail();
    unique(order.order_id,ids);const original=items(order.items,false,new Map());
    for(const refund of order.refunds) {
      if(++refundCount>128||!exact(refund,['refund_id','created_at','amount','payment_refunded','items'])
          ||!date(refund.created_at,now)||!decimal(refund.amount)
          ||!(refund.payment_refunded===null||typeof refund.payment_refunded==='boolean'))fail();
      unique(refund.refund_id,ids);items(refund.items,true,original);
    }
  }
  if(Buffer.byteLength(JSON.stringify(native))>64000)fail();
  return native;
}
