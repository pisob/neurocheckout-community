// Original facts supplied and signed by Cloud; Community only stores/transports.
export function validateRecommendationContext(value, agent) {
  const keys = (v, expected) => v && !Array.isArray(v) && typeof v === 'object' && Object.keys(v).sort().join() === expected.sort().join();
  const playbooks = ['customer_preference_proactive','win_back_at_risk','new_high_potential_nurture','deal_seeker_offer','interest_category_highlight'];
  const invalid = () => { throw Error('email_archive_invalid'); };
  const exact = (pattern, text) => typeof text === 'string' && pattern.exec(text)?.[0] === text;
  if (!keys(value, ['schema','playbook_code','currency','products']) || value.schema !== 1 ||
      !playbooks.includes(value.playbook_code) || agent !== (value.playbook_code === 'customer_preference_proactive' ? 'customer_preference_proactive' : 'intelligent_email_marketing') ||
      !exact(/^[A-Z]{3}$/, value.currency) ||
      !Array.isArray(value.products) || value.products.length < 1 || value.products.length > 3) invalid();
  const families = new Set();
  for (const p of value.products) {
    if (!keys(p, ['product_id','attribute_id','category_path','brand_name','price_band']) ||
        !exact(/^[1-9][0-9]{0,9}$/, p.product_id) ||
        !exact(/^(?:0|[1-9][0-9]{0,9})$/, p.attribute_id) ||
        families.has(p.product_id) || !['entry','mid','premium'].includes(p.price_band)) invalid();
    for (const key of ['category_path','brand_name']) {
      const text = p[key];
      if (text !== null && (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 240 || /[\x00-\x1f\x7f]/.test(text))) invalid();
    }
    families.add(p.product_id);
  }
  return value;
}
