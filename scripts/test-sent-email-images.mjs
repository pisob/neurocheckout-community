import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NC_PLAYWRIGHT_MODULE || '@playwright/test');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync('lib/sent-email-preview.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const links = await page.evaluate(code => {
    const exports = {};
    new Function('exports', code)(exports);
    return [
      exports.sentEmailRecoveryLink('<a href="javascript:alert(1)">Return to my cart</a>'),
      exports.sentEmailRecoveryLink('<a href="https://user:pass@shop.example/cart">Return to my cart</a>'),
      exports.sentEmailRecoveryLink('<a href="https://shop.example/cart?token=test&amp;id=42">Reprendre mon panier</a>'),
      exports.sentEmailRecoveryLink('<a href="https://shop.example/unsubscribe">Unsubscribe cart emails</a>'),
    ];
  }, code);
  assert.deepEqual(links, [null, null, { href: 'https://shop.example/cart?token=test&id=42', label: 'Reprendre mon panier' }, null]);
  const requests = [];
  await page.route('https://**/*', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMngAAAAASUVORK5CYII=', 'base64') });
  });
  const html = await page.evaluate(code => {
    const exports = {};
    new Function('exports', code)(exports);
    return exports.sentEmailPreview(`<style>body{background:url(https://tracking.invalid/css.png)}</style>
      <img width="72" height="72" src="https://shop.example/product.jpg">
      <img width="1" height="1" src="https://tracking.invalid/open.png">
      <img src="https://tracking.invalid/pixel.png">
      <img src="https://tracking.invalid/open?customer=1">
      <a href="https://tracking.invalid/click">Recover cart</a>`);
  }, code);
  await page.setContent('<iframe sandbox="" referrerpolicy="no-referrer"></iframe>');
  await page.locator('iframe').evaluate((frame, html) => { frame.srcdoc = html; }, html);
  await page.frameLocator('iframe').locator('img[src]').waitFor();
  await page.waitForTimeout(500);
  assert.deepEqual(requests, ['https://shop.example/product.jpg']);
  assert.equal(await page.frameLocator('iframe').locator('a[href]').count(), 0);
  assert.equal(await page.frameLocator('iframe').locator('img[src]').evaluate(image => image.complete && image.naturalWidth > 0), true);
  console.log('Product image loads; tracking, CSS requests and CTA navigation stay blocked.');
} finally { await browser.close(); }
