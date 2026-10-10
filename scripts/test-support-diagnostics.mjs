import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const health=readFileSync(new URL('../components/SynchronizationHealth.tsx',import.meta.url),'utf8');
for (const code of ['quota_blocked','abandonment_wait','agent_wait','pre_send_wait','delivery_uncertain','source_unavailable','next_attempt_at']) assert.ok(health.includes(code));
assert.ok(health.includes('pas une heure d’envoi garantie'));
assert.ok(health.includes('ne prouve pas à elle seule'));
const preview=readFileSync(new URL('../components/SentEmailPreview.tsx',import.meta.url),'utf8');
for (const text of ['Non enregistrée','copy_diagnostic','Bibliothèque personnalisée','Variante DB','BYOK']) assert.ok(preview.includes(text));
console.log('Bilingual diagnostic labels and honest unknown-state checks passed.');
