import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/email-history-archive.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { enrichEmailHistory } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const sent_at = '2026-09-01T12:00:00Z';
const item = (id) => ({ delivery_id: id, sent_at, subject: 'Cloud subject', status: 'converted', converted_at: sent_at });
const copy = (id) => ({ delivery_id: id, subject: 'Archived subject', recipient_email: 'test@example.invalid', body_html: '<p>Original</p>' });
const calls = [];
const archive = {
  get(id) { if (id === 'broken') throw Error('unreadable'); return copy(id); },
  confirm(id) { calls.push(id); if (id === 'retry') throw Error('busy'); },
};
const result = enrichEmailHistory([item('broken'), item('good'), item('retry')], archive);
assert.equal(result.length, 3);
assert.equal(result[0].preview_available, false);
for (const row of result.slice(1)) {
  assert.equal(row.subject, 'Archived subject');
  assert.equal(row.body_html, '<p>Original</p>');
  assert.equal(row.status, 'converted');
  assert.equal(row.converted_at, sent_at);
}
assert.deepEqual(calls, ['good', 'retry']);
assert.equal(enrichEmailHistory([item('good')], { get: () => copy('wrong'), confirm() { throw Error('must not confirm'); } })[0].preview_available, false);
assert.equal(enrichEmailHistory([{ ...item('good'), sent_at: null }], archive)[0].preview_available, false);
const cloud = { ...item('cloud'), body_html: '<p>Cloud original</p>' };
assert.equal(enrichEmailHistory([cloud])[0].preview_available, true);
assert.equal(enrichEmailHistory([cloud], { get: () => ({ delivery_id: 'cloud', body_html: '', subject: '' }), confirm() {} })[0].body_html, cloud.body_html);
assert.equal(enrichEmailHistory(Array.from({ length: 15 }, (_, i) => item(String(i))), archive).length, 15);
console.log('Archive isolation, exact identity, confirmation failure, Cloud fallback and status preservation passed.');
