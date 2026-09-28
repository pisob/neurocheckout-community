import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../lib/public-presentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022 },
}).outputText;
const { publicErrorMessage } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const language of ['en', 'fr']) {
  for (const unknown of ['sk_test_DO_NOT_DISPLAY', 'postgres://private', { stack: 'private' }, null]) {
    assert.equal(publicErrorMessage(unknown, { en: 'Retry', fr: 'Réessayer' }, language), language === 'fr' ? 'Réessayer' : 'Retry');
  }
  for (const known of ['cloud_unavailable', 'community_scope_required', 'community_paid_upgrade_required', 'update_busy']) {
    const message = publicErrorMessage(known, { en: 'fallback', fr: 'fallback' }, language);
    assert.notEqual(message, 'fallback');
    assert(!message.includes(known));
  }
}
console.log('PASS: bilingual recovery messages; unknown technical details never rendered.');
