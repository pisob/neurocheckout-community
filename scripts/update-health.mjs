// A healthy unrelated/stale process must never validate a different release.
export function matchesUpdateHealth(body, expectedVersion) {
  return Boolean(body && body.ok === true && body.service === 'neurocheckout-community'
    && typeof expectedVersion === 'string' && body.version === expectedVersion);
}

export function updateFailureCode(error, stage = '') {
  const code = error?.message;
  const allowed = new Set(['update_disk_space_low', 'update_private_directory_required',
    'asset_unavailable', 'asset_missing', 'signature_rejected', 'candidate_unhealthy',
    'backup_invalid', 'backup_database_invalid', 'backup_unsafe_path', 'backup_private_directory_required']);
  if (allowed.has(code)) return code;
  return stage === 'backup' ? 'backup_failed' : 'update_failed';
}
