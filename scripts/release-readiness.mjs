import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const requiredChecks = ['frontoffice_regression', 'update_rollback_restore', 'diagnostics',
  'signed_distribution', 'security_audit', 'merchant_journey'];
export function validateStableReadiness(report, version, sourceTree) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('stable_version_required');
  if (report?.schema !== 1 || report.version !== version || report.source_tree !== sourceTree ||
      !/^[a-f0-9]{40,64}$/.test(sourceTree || '')) throw new Error('readiness_revision_mismatch');
  for (const name of requiredChecks) {
    const check=report.checks?.[name];
    if (check?.status !== 'passed' || typeof check.evidence !== 'string' || !check.evidence.trim() ||
        typeof check.reviewed_by !== 'string' || !check.reviewed_by.trim() ||
        !Number.isFinite(Date.parse(check.checked_at || ''))) throw new Error('readiness_pending:' + name);
  }
  if (!Array.isArray(report.blockers) || report.blockers.length) throw new Error('readiness_blockers');
  return true;
}
// Maintainer attestation gate, not an automatic proof of a merchant transaction.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [revision, reportPath] = process.argv.slice(2);
    if (!/^v\d+\.\d+\.\d+$/.test(revision || '') || !reportPath) throw new Error('usage: release-readiness.mjs STABLE_TAG PRIVATE_EVIDENCE_JSON');
    const metadata=JSON.parse(execFileSync('git',['show',`${revision}:package.json`],{encoding:'utf8'}));
    if (metadata.version !== revision.slice(1)) throw new Error('tag_version_mismatch');
    const tree=execFileSync('git',['rev-parse',`${revision}^{tree}`],{encoding:'utf8'}).trim();
    validateStableReadiness(JSON.parse(readFileSync(reportPath,'utf8')),metadata.version,tree);
    console.log('Stable release evidence accepted for this exact source tree.');
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
