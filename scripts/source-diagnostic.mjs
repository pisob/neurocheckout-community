const codes = new Set(['source_auth_rejected', 'source_unavailable', 'source_signature_rejected', 'source_sync_invalid']);
export function sourceFailureCode(error) {
  return codes.has(error?.message) ? error.message : 'source_unavailable';
}
export function recordSourceDiagnostic(store, code, now = Date.now()) {
  // Only an enum and timestamp; never persist URLs, keys, response bodies or customers.
  store.db.prepare("INSERT INTO meta(name,value) VALUES('source_diagnostic',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify({ code: code === 'ok' ? code : sourceFailureCode(new Error(code)), checked_at: now }));
}
export function readSourceDiagnostic(store) {
  try {
    const value = JSON.parse(store.db.prepare("SELECT value FROM meta WHERE name='source_diagnostic'").get()?.value || '{}');
    if ((value.code === 'ok' || codes.has(value.code)) && Number.isFinite(value.checked_at) && value.checked_at > 0) return value;
  } catch { /* Unknown is not healthy. */ }
  return null;
}
