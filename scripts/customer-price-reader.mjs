// Authenticated data transport only. No selection, campaign decisions or storage.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SourceSynchronizer, connectorEndpoint } from './local-source-sync.mjs';
import { postSourcePage, sourceRequestSignature, sourceResponseSignature } from './source-pull-client.mjs';

const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const id = v => typeof v === 'string' && /^[1-9][0-9]{0,9}$/.test(v);
const email = v => typeof v === 'string' && v.length <= 254 && /^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+\.[^@\s<>\x00-\x1f\x7f]+$/.test(v);
const fail = () => { throw new Error('customer_prices_unavailable'); };
const money = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;

export function validateCustomerPriceRequest(input) {
  if (!exact(input, ['storeId','websiteId','customerId','customerEmail','productIds','currency'])
      || !['storeId','websiteId','customerId'].every(k => id(input[k])) || !email(input.customerEmail)
      || typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)
      || !Array.isArray(input.productIds) || input.productIds.length < 1 || input.productIds.length > 16
      || !input.productIds.every(id) || new Set(input.productIds).size !== input.productIds.length) fail();
  return input;
}

export function validateCustomerPrices(prices, input, now = Date.now()) {
  validateCustomerPriceRequest(input);
  if (!exact(prices, ['schema','store_id','website_id','customer_id','customer_email','customer_group_id',
        'customer_tax_class_id','currency','quantity','read_at','offers'])
      || prices.schema !== 'magento-customer-prices-v1'
      || ![['store_id','storeId'],['website_id','websiteId'],['customer_id','customerId']].every(([a,b]) => Number.isSafeInteger(prices[a]) && String(prices[a]) === input[b])
      || !email(prices.customer_email) || prices.customer_email.toLowerCase() !== input.customerEmail.toLowerCase()
      || !['customer_group_id','customer_tax_class_id'].every(k => Number.isSafeInteger(prices[k]) && prices[k] >= 0 && prices[k] <= 9999999999)
      || prices.currency !== input.currency || prices.quantity !== 1
      || typeof prices.read_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(prices.read_at)
      || !Number.isFinite(Date.parse(prices.read_at)) || Math.abs(now - Date.parse(prices.read_at)) > 15_000
      || !Array.isArray(prices.offers) || prices.offers.length !== input.productIds.length) fail();
  for (const [i, offer] of prices.offers.entries()) {
    if (offer?.product_id !== input.productIds[i]) fail();
    if (offer.status === 'unavailable') {
      if (!exact(offer, ['product_id','status'])) fail();
      continue;
    }
    if (!exact(offer, ['product_id','status','currency','price_excl_tax','price_incl_tax','display_mode','display_price'])
        || offer.status !== 'available' || offer.currency !== input.currency
        || !money(offer.price_excl_tax) || !money(offer.price_incl_tax) || offer.price_incl_tax < offer.price_excl_tax
        || !['excluding_tax','including_tax','both'].includes(offer.display_mode)) fail();
    const expected = offer.display_mode === 'both' ? null : offer[offer.display_mode === 'including_tax' ? 'price_incl_tax' : 'price_excl_tax'];
    if (offer.display_price !== expected) fail();
  }
  return prices;
}

const sourceTransport = (endpoint, body, headers) => postSourcePage(endpoint, body, headers, { signal: AbortSignal.timeout(6000), maxBytes: 16384 });
export async function readCustomerPrices(store, request, transport = sourceTransport) {
  try {
    // Snapshot the caller's values across the await, never trust a callback URL.
    const input = structuredClone(validateCustomerPriceRequest(request));
    store.requireSourceFresh();
    const installationId = store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
    if (!installationId) fail();
    const sync = new SourceSynchronizer(store), config = sync.configuration();
    const path = connectorEndpoint(config.endpoint).pathname;
    if (!/\/neurocheckout\/community\/pull$/.test(path)) fail();
    const body = JSON.stringify({ schema: 1, shopId: store.config.shopId, operation: 'customer_prices', ...input });
    if (Buffer.byteLength(body) > 2048) fail();
    const nonce = randomBytes(16).toString('hex'), timestamp = String(Date.now());
    const response = await transport(config.endpoint, body, {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-NC-Source-Time': timestamp, 'X-NC-Source-Nonce': nonce,
      'X-NC-Source-Signature': sourceRequestSignature(config.secret, path, store.config.shopId, timestamp, nonce, body),
    });
    if (!Buffer.isBuffer(response.body) || response.body.length > 16384
        || typeof response.signature !== 'string' || !/^[a-f0-9]{64}$/.test(response.signature)
        || !timingSafeEqual(Buffer.from(response.signature, 'hex'), Buffer.from(sourceResponseSignature(config.secret, nonce, response.body), 'hex'))) fail();
    const page = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body));
    if (!exact(page, ['schema','shopId','operation','requestHash','prices']) || page.schema !== 1
        || page.shopId !== store.config.shopId || page.operation !== 'customer_prices'
        || page.requestHash !== createHash('sha256').update(body).digest('hex')) fail();
    const prices = validateCustomerPrices(page.prices, input);
    store.requireSourceFresh();
    const current = sync.configuration();
    if (current.endpoint !== config.endpoint || current.secret !== config.secret
        || store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value !== installationId) fail();
    return { schema: 1, shopId: store.config.shopId, installationId, prices };
  } catch { fail(); } // Never log addresses, native exceptions or raw replies.
}
