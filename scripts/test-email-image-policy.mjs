import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const source = ts.transpile(await readFile(new URL('../lib/sent-email-preview.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }).replace(/^export /gm, '');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(source => {
    const render = new Function(source + '; return sentEmailPreview;')();
    const base = 'https://assets.example.test';
    const html = render([
      '<img alt="logo" src="https://private.example.test/api/v1/public/shop-logo/shop-1?v=abcdef123456">',
      '<img alt="product" src="https://private.example.test/api/v1/public/email-image-cache/shop-1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg">',
      '<img alt="tracking" src="https://private.example.test/email/open?id=1">',
      '<img alt="badquery" src="https://private.example.test/api/v1/public/shop-logo/shop-1?v=abcdef123456&amp;tracking=1">',
      '<img alt="other" src="https://private.example.test/private-logo?v=abcdef123456">',
      '<img alt="tiny" width="1" src="https://private.example.test/api/v1/public/shop-logo/shop-1?v=abcdef123456">',
    ].join(''), base);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      sources: [...doc.querySelectorAll('img[src]')].map(img => img.getAttribute('src')),
      policy: doc.querySelector('meta[http-equiv]')?.getAttribute('content'),
      untrusted: render('<img src="https://untrusted.test/api/v1/public/shop-logo/shop-1?v=abcdef123456">'),
    };
  }, source);
  assert.deepEqual(result.sources, [
    'https://assets.example.test/api/v1/public/shop-logo/shop-1?v=abcdef123456',
    'https://assets.example.test/api/v1/public/email-image-cache/shop-1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  ]);
  assert.ok(result.policy.includes(result.sources[0]));
  assert.ok(result.policy.includes("connect-src 'none'"));
  assert.ok(!result.untrusted.includes('img src='));
  console.log('Public logo and product preview policy passed; tracking and unknown endpoints remain blocked.');
} finally { await browser.close(); }
