import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingEligible, parseFunding, nextSponsor, publicFundingUrl, supportUrl } from '../lib/community-funding.ts';

const free = { plan: { code: 'community' }, subscription: { status: 'free_active', active: true } };
test('only fresh confirmed free accounts see funding; paid, trial and unknown never do', () => {
  for (const plan of ['community', 'starter', 'pro', 'enterprise', '', 'unknown']) {
    for (const status of ['free_active', 'paid_active', 'trial_active', 'payment_failed_grace', 'cancelled', 'expired', 'pending']) {
      assert.equal(fundingEligible({ plan: { code: plan }, subscription: { status, active: true } }, true), plan === 'community' && status === 'free_active');
    }
  }
  assert.equal(fundingEligible(free, false), false);
  assert.equal(fundingEligible(null, true), false);
  assert.equal(fundingEligible({ ...free, subscription: { status: 'free_active', active: false } }, true), false);
});

const now = Date.now();
const fixture = () => ({ schema_version: 1, eligible: true, expires_at: new Date(now + 60000).toISOString(),
  sponsor: { id: 'hosting', url: 'https://partner.example.com/offer', fr: { title: 'Hébergement', description: 'Pour votre boutique.' }, en: { title: 'Hosting', description: 'For your store.' } }, support: { mode: 'test' } });
test('funding is bounded, not a persistent paid-account fallback', () => {
  const data = fixture();
  assert.ok(parseFunding(data, now));
  for (const value of [null, {}, { ...data, eligible: false }, { ...data, schema_version: 2 }, { ...data, expires_at: 'invalid' },
    { ...data, expires_at: new Date(now-1).toISOString() }, { ...data, expires_at: new Date(now+200000).toISOString() }]) assert.equal(parseFunding(value, now), null);
  data.sponsor.fr.title = '<img src=x onerror=alert(1)>';
  assert.equal(parseFunding(data, now).sponsor, null);
});
test('external destinations never carry credentials, trackers or local addresses', () => {
  assert.ok(publicFundingUrl('https://partner.example.com/service'));
  for (const value of ['javascript:alert(1)', 'http://partner.example.com', 'https://127.0.0.1/', 'https://[::1]/',
    'https://localhost/', 'https://shop.local', 'https://shop.internal', 'https://user:secret@example.com',
    'https://example.com?email=member@example.com', 'https://example.com#track', 'https://example.com\\@evil.com']) assert.equal(publicFundingUrl(value), false, value);
});
test('Stripe destination must match the configured sandbox, never fall back to real payments', () => {
  assert.ok(supportUrl('https://buy.stripe.com/test_fixture', 'test'));
  assert.ok(supportUrl('https://buy.stripe.com/fixture', 'live'));
  for (const value of ['https://buy.stripe.com/fixture', 'https://buy.stripe.com.evil.com/test_fixture', 'https://evil.com/pay',
    'https://buy.stripe.com/test_fixture?prefilled_email=secret']) assert.equal(supportUrl(value, 'test'), false);
  assert.equal(supportUrl('https://buy.stripe.com/test_fixture', 'live'), false);
});

test('images are optional, bounded asset references, never external tracker URLs', () => {
  const data = fixture();
  const image = { asset_id: 'a'.repeat(64), width: 600, height: 200, animated: true, alt_fr: 'Visuel', alt_en: 'Creative' };
  data.sponsor.image = image;
  assert.deepEqual(parseFunding(data, now).sponsor.image, image);
  for (const patch of [{ asset_id: '../secret' }, { asset_id: 'https://tracker.example.com/pixel' }, { width: 9999 },
    { height: 0 }, { width: '600' }, { animated: 'true' }, { alt_fr: '<script>' }, { alt_en: '' }]) {
    data.sponsor.image = { ...image, ...patch };
    const result = parseFunding(data, now);
    assert.equal(result.sponsor.image, null);
    assert.equal(result.sponsor.fr.title, 'Hébergement');
    assert.equal(result.support.mode, 'test');
  }
  data.sponsor.image = { ...image, src: 'https://tracker.example.com/pixel' };
  assert.equal(parseFunding(data, now).sponsor.image.src, undefined);
});

test('rotation validates the full list and avoids immediate repeats with no persistent content', () => {
  const data = fixture(); const a = data.sponsor, b = { ...a, id: 'second' };
  const parsed = parseFunding({ ...data, sponsors: [a, b, a, { ...a, id: 'bad', url: 'https://127.0.0.1' }] }, now);
  assert.deepEqual(parsed.sponsors.map(s => s.id), ['hosting', 'second']);
  assert.equal(nextSponsor(parsed.sponsors, 'hosting').id, 'second');
  assert.equal(nextSponsor(parsed.sponsors, 'second').id, 'hosting');
  assert.equal(nextSponsor([a], 'hosting').id, 'hosting');
  assert.equal(nextSponsor([], null), null);
  assert.equal(nextSponsor(parsed.sponsors, null, () => 0).id, 'hosting');
  assert.equal(nextSponsor(parsed.sponsors, null, () => 0.9).id, 'second');
  assert.deepEqual(parseFunding({ ...data, sponsors: [] }, now).sponsors, []);
  assert.deepEqual(parseFunding({ ...data, sponsors: Array(21).fill(a) }, now).sponsors, []);
  assert.deepEqual(parseFunding({ ...data, sponsors: {} }, now).sponsors, []);
  assert.equal(parseFunding(data, now).sponsors.length, 1, 'Old Cloud remains supported');
});
