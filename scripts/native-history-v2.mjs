// Additive native discount evidence. Unknown remains null; v1 is unchanged.
export function legacyHistoryFacts(history,schema) {
  if(history?.schema!==schema.replace(/-v1$/,'-v2'))return history;
  const fail=()=>{throw new Error('customer_history_unavailable');};
  if(!Array.isArray(history.orders)||history.orders.length>128)fail();
  for(const order of history.orders) {
    if(!order||typeof order!=='object'||Array.isArray(order)||!Object.hasOwn(order,'discount_total'))fail();
    const value=order.discount_total;
    if(value!==null&&(typeof value!=='string'||!/^\d{1,26}(?:\.\d{1,8})?$/.test(value)))fail();
  }
  const legacy=structuredClone(history);
  legacy.schema=schema;
  for(const order of legacy.orders)delete order.discount_total;
  return legacy;
}
