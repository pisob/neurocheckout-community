import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const requiredChecks = ['frontoffice_regression', 'update_rollback_restore', 'diagnostics',
  'signed_distribution', 'security_audit', 'merchant_journey', 'automatic_journeys',
  'failure_recovery', 'quota_lifecycle'];
export const minimumObservationHours = 72;
export function validateStableReadiness(report, version, sourceTree, now = Date.now()) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('stable_version_required');
  if (report?.schema !== 2 || report.version !== version || report.source_tree !== sourceTree ||
      !/^[a-f0-9]{40,64}$/.test(sourceTree || '')) throw new Error('readiness_revision_mismatch');
  for (const name of requiredChecks) {
    const check=report.checks?.[name];
    if (check?.status !== 'passed' || typeof check.evidence !== 'string' || !check.evidence.trim() ||
        typeof check.reviewed_by !== 'string' || !check.reviewed_by.trim() ||
        !Number.isFinite(Date.parse(check.checked_at || '')) || Date.parse(check.checked_at) > now) throw new Error('readiness_pending:' + name);
  }
  if (!Array.isArray(report.blockers) || report.blockers.length) throw new Error('readiness_blockers');
  const acceptance = report.owner_acceptance;
  if (acceptance?.accepted !== true || typeof acceptance.reviewed_by !== 'string' || !acceptance.reviewed_by.trim() ||
      !Number.isFinite(Date.parse(acceptance.checked_at || '')) || Date.parse(acceptance.checked_at) > now ||
      typeof acceptance.evidence !== 'string' || !acceptance.evidence.trim()) throw new Error('readiness_owner_acceptance');
  const observation = report.observation;
  const samples = observation?.samples;
  if (observation?.source_tree !== sourceTree || !Array.isArray(samples) || samples.length < 4) throw new Error('readiness_observation');
  let first, previous;
  for (const sample of samples) {
    const checked = Date.parse(sample?.checked_at || '');
    if (!Number.isFinite(checked) || checked > now || (previous !== undefined && (checked <= previous || checked - previous > 24 * 60 * 60 * 1000)) ||
        sample.status !== 'passed' || typeof sample.evidence !== 'string' || !sample.evidence.trim() ||
        ['critical_incidents', 'duplicate_sends', 'data_loss_events'].some(key => sample[key] !== 0)) throw new Error('readiness_observation');
    first ??= checked;
    previous = checked;
  }
  if (previous - first < minimumObservationHours * 60 * 60 * 1000 || now - previous > 24 * 60 * 60 * 1000) throw new Error('readiness_observation');
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
