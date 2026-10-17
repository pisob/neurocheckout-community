import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { LocalDataStore, initializeLocalData } from './local-data-store.mjs';
import { SourceSynchronizer } from './local-source-sync.mjs';
import { readCustomerPrices, validateCustomerPriceRequest, validateCustomerPrices } from './customer-price-reader.mjs';
import { sourceRequestSignature, sourceResponseSignature } from './source-pull-client.mjs';
import { saveRelayCredential, relayOnce } from './server-data-relay.mjs';

const installation = '11111111-1111-4111-8111-111111111111';
const input = () => ({ nativeShopId: '1', customerId: '47', customerEmail: 'recipient@example.test', productIds: ['1', '2'], currency: 'EUR' });
const prices = () => ({ schema: 'prestashop-customer-prices-v1', native_shop_id: 1, customer_id: 47,
  customer_email: 'recipient@example.test', currency: 'EUR', quantity: 1, price_decimals: 2,
  context_hash: 'a'.repeat(64), read_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  offers: [{ product_id: '1', attribute_id: '3', status: 'available', currency: 'EUR',
    price_excl_tax: 10.1234, price_incl_tax: 12.14808, display_mode: 'including_tax', display_price: 12.15 },
  { product_id: '2', status: 'unavailable' }] });
const source = { endpoint: 'https://shop.example.invalid/shop/module/neurocheckoutconnector/communitydata', secret: 'ab'.repeat(32) };

function fixture(t, configuration = source) {
  const directory = mkdtempSync(resolve(tmpdir(), 'nc-presta-prices-'));
  initializeLocalData(directory, 'synthetic-shop');
  const store = new LocalDataStore(directory); store.bindInstallation(installation);
  const sync = new SourceSynchronizer(store); sync.configure(configuration);
  store.db.prepare('UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1').run(Date.now());
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, store, sync };
}

function transport(change = () => {}, after = () => {}) {
  return async (url, body, headers) => {
    assert.equal(url, source.endpoint);
    const request = JSON.parse(body);
    assert.equal(request.nativeShopId, '1'); assert.equal(request.operation, 'customer_prices');
    assert.equal(headers['X-NC-Source-Signature'], sourceRequestSignature(source.secret, new URL(url).pathname,
      request.shopId, headers['X-NC-Source-Time'], headers['X-NC-Source-Nonce'], body));
    const page = { schema: 1, shopId: 'synthetic-shop', operation: 'customer_prices',
      requestHash: createHash('sha256').update(body).digest('hex'), prices: prices() };
    change(page); after();
    const raw = Buffer.from(JSON.stringify(page));
    return { body: raw, signature: sourceResponseSignature(source.secret, headers['X-NC-Source-Nonce'], raw) };
  };
}

test('Presta signed native prices retain combinations/tax display without storing recipient data', async t => {
  const { store, directory } = fixture(t);
  const result = await readCustomerPrices(store, input(), transport());
  assert.equal(result.installationId, installation);
  assert.equal(result.prices.offers[0].attribute_id, '3');
  assert.equal(result.prices.offers[0].display_price, 12.15);
  assert.equal(store.signals().length, 0);
  assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n, 0);
  for (const name of readdirSync(directory).filter(n => n.startsWith('local-data.sqlite')))
    assert.equal(readFileSync(resolve(directory, name)).includes(Buffer.from('recipient@example.test')), false);
});

test('Presta requests reject other platforms and caller-selected transport before network access', async t => {
  const { store } = fixture(t);
  for (const patch of [{ blogId: '1' }, { storeId: '1' }, { url: 'https://external.invalid' },
    { nativeShopId: 1 }, { nativeShopId: '01' }, { customerId: '0' }, { customerEmail: 'bad' },
    { currency: 'eur' }, { productIds: [] }, { productIds: ['1', '1'] }, { productIds: [1] },
    { productIds: Array.from({ length: 17 }, (_, i) => String(i + 1)) }]) {
    assert.throws(() => validateCustomerPriceRequest({ ...input(), ...patch }), /customer_prices_unavailable/);
    await assert.rejects(readCustomerPrices(store, { ...input(), ...patch }, () => assert.fail('no network')), /customer_prices_unavailable/);
  }
  for (const path of ['/wp-json/neurocheckout/v1/communitydata', '/neurocheckout/community/pull']) {
    const other = fixture(t, { ...source, endpoint: 'https://shop.example.invalid' + path });
    await assert.rejects(readCustomerPrices(other.store, input(), () => assert.fail('no network')), /customer_prices_unavailable/);
  }
});

test('Presta refuses foreign identities, stale/incomplete offers and altered tax/combination data', async t => {
  const { store } = fixture(t);
  const changes = [p => { p.native_shop_id = 2; }, p => { p.customer_id = 48; },
    p => { p.customer_email = 'other@example.test'; }, p => { p.currency = 'USD'; },
    p => { p.quantity = true; }, p => { p.price_decimals = true; }, p => { p.context_hash = 'bad'; },
    p => { p.read_at = '2020-01-01T00:00:00Z'; }, p => { p.offers.pop(); }, p => { p.offers.reverse(); },
    p => { p.offers[0].attribute_id = 3; }, p => { p.offers[0].price_incl_tax = NaN; },
    p => { p.offers[0].display_price = 10.12; }, p => { p.offers[0].display_price = 12.151; },
    p => { p.offers[0].display_mode = 'both'; }, p => { p.address = 'private'; }];
  for (const change of changes)
    await assert.rejects(readCustomerPrices(store, input(), transport(p => change(p.prices))), /customer_prices_unavailable/);
  await assert.rejects(readCustomerPrices(store, input(), transport(p => { p.requestHash = 'f'.repeat(64); })), /customer_prices_unavailable/);
  let previous;
  await readCustomerPrices(store, input(), async (...args) => { previous = await transport()(...args); return previous; });
  await assert.rejects(readCustomerPrices(store, input(), async () => previous), /customer_prices_unavailable/);
});

test('Presta directed rounding and unavailable offers never invent a fallback price', () => {
  for (const display_price of [12.14, 12.15]) {
    const result = prices(); result.offers[0].display_price = display_price;
    assert.equal(validateCustomerPrices(result, input()), result);
  }
  const result = prices(); result.offers[0] = { product_id: '1', status: 'unavailable' };
  assert.equal(validateCustomerPrices(result, input()), result);
  result.offers[0].display_price = 0;
  assert.throws(() => validateCustomerPrices(result, input()), /customer_prices_unavailable/);
});

test('Presta prices are invalidated by source outage, key rotation or installation replacement', async t => {
  for (const mode of ['key', 'source', 'installation']) {
    const { store, sync } = fixture(t);
    await assert.rejects(readCustomerPrices(store, input(), transport(() => {}, () => {
      if (mode === 'key') sync.configure({ ...source, secret: 'cd'.repeat(32) });
      if (mode === 'source') store.db.prepare('UPDATE source_sync SET ready=0 WHERE id=1').run();
      if (mode === 'installation') store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run('22222222-2222-4222-8222-222222222222');
    })), /customer_prices_unavailable/);
  }
});

test('Cloud Presta price command reaches the configured signed source, with redacted failures', async t => {
  const { store, directory } = fixture(t);
  const options = { directory, enabled: true, environment: 'staging', secret: 'synthetic-session-secret-over-32-chars',
    cloudUrl: 'http://127.0.0.1:43120', clientId: 'synthetic-client', port: '43119', version: 'synthetic' };
  const credential = { token: 'nc_data_' + randomBytes(32).toString('base64url'), installation_id: installation, shop_id: 'synthetic-shop' };
  await saveRelayCredential(options, credential); let reply;
  const mock = async (url, init) => {
    if (url.endsWith('/api/health')) return Response.json({ service: 'neurocheckout-community' });
    assert.ok(url.startsWith(options.cloudUrl));
    assert.equal(init.headers.Authorization, 'Bearer ' + credential.token);
    if (url.endsWith('/poll')) return Response.json({ commands: [{ request_id: 'a'.repeat(32), operation: 'read_customer_prices', record: input() }] });
    assert.ok(url.endsWith('/reply')); reply = JSON.parse(init.body).result;
    return Response.json({ accepted: true });
  };
  assert.equal(await relayOnce(options, mock, transport()), true);
  assert.equal(reply.status, 'ok'); assert.equal(reply.result.prices.offers[0].display_price, 12.15);
  assert.equal(await relayOnce(options, mock, async () => { throw Error('private native detail'); }), true);
  assert.deepEqual(reply, { status: 'unavailable' }); assert.equal(store.signals().length, 0);
});
