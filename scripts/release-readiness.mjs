import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const requiredChecks = ['frontoffice_regression', 'update_rollback_restore', 'diagnostics',
  'signed_distribution', 'security_audit', 'merchant_journey', 'automatic_journeys',
  'failure_recovery', 'quota_lifecycle'];
export const minimumObservationHours = 72;
export function validateStableReadiness(report, version, sourceTree, now = Date.now()) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('stable_version_required');
  if (![2, 3].includes(report?.schema) || report.version !== version || report.source_tree !== sourceTree ||
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
  // One release only: the owner explicitly accepted publishing 0.1.0 without
  // completing the observation window. Preserve that decision in the signed
  // attestation instead of fabricating passed samples. All checks above and the
  // independent GitHub environment approval still apply.
  if (observation?.status === 'waived_by_owner') {
    const exception = observation.owner_exception;
    const approvedAt = Date.parse(exception?.approved_at || '');
    if (report.schema !== 3 || version !== '0.1.0' || observation.source_tree !== sourceTree ||
        !Array.isArray(samples) || samples.length !== 0 || exception?.approved !== true ||
        exception.version !== version || exception.source_tree !== sourceTree ||
        exception.scope !== 'observation_duration_only' || exception.required_hours !== minimumObservationHours ||
        typeof exception.approved_by !== 'string' || !exception.approved_by.trim() ||
        typeof exception.reason !== 'string' || !exception.reason.trim() ||
        typeof exception.evidence !== 'string' || !exception.evidence.trim() ||
        !Number.isFinite(approvedAt) || approvedAt > now || approvedAt > Date.parse(acceptance.checked_at)) {
      throw new Error('readiness_observation_exception');
    }
    return true;
  }
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
    const report=JSON.parse(readFileSync(reportPath,'utf8'));
    validateStableReadiness(report,metadata.version,tree);
    if (report.observation.status === 'waived_by_owner') {
      console.log('Observation duration waived by the owner for 0.1.0; no completed 72-hour observation is claimed.');
    }
    console.log('Stable release evidence accepted for this exact source tree.');
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
