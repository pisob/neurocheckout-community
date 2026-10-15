import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredChecks, validateStableReadiness } from './release-readiness.mjs';
const now=Date.parse('2026-10-15T12:00:00Z');
function report() {
  const review={status:'passed',evidence:'Synthetic test evidence',reviewed_by:'test-maintainer',checked_at:new Date(now).toISOString()};
  return {schema:2,version:'0.1.0',source_tree:'a'.repeat(40),blockers:[],
    checks:Object.fromEntries(requiredChecks.map(name=>[name,{...review}])),
    owner_acceptance:{...review,accepted:true},
    observation:{source_tree:'a'.repeat(40),samples:[72,48,24,0].map(hours=>({checked_at:new Date(now-hours*3600000).toISOString(),status:'passed',evidence:'Synthetic observation',critical_incidents:0,duplicate_sends:0,data_loss_events:0}))}};
}
const validate=(value,version='0.1.0',tree='a'.repeat(40))=>validateStableReadiness(value,version,tree,now);
test('stable promotion requires every check including the user merchant journey',()=>{
  assert.equal(validate(report()),true);
  for(const name of requiredChecks) {const value=report();value.checks[name].status='pending';assert.throws(()=>validate(value),/readiness_pending/);}
  const value=report();value.blockers=['unresolved'];assert.throws(()=>validate(value),/blockers/);
  assert.throws(()=>validate(report(),'0.1.0','b'.repeat(40)),/revision/);
  assert.throws(()=>validate(report(),'0.1.0-preview.29'),/stable_version/);
});
test('stable requires explicit owner acceptance, not implementation approval or CI alone',()=>{
  for(const acceptance of [undefined,{}, {accepted:false}, {...report().owner_acceptance,checked_at:'2099-01-01'}, {...report().owner_acceptance,evidence:''}]) {
    const value=report();value.owner_acceptance=acceptance;assert.throws(()=>validate(value),/owner_acceptance/);
  }
});
test('observation cannot be accelerated, stale, incomplete, future-dated or from another candidate',()=>{
  const cases=[r=>r.observation.samples.shift(), r=>r.observation.samples[0].checked_at=new Date(now-71*3600000).toISOString(),
    r=>r.observation.samples[1].checked_at=r.observation.samples[0].checked_at,
    r=>r.observation.samples[1].checked_at=new Date(now-49*3600000).toISOString(),
    r=>r.observation.samples.at(-1).checked_at='2099-01-01',r=>r.observation.source_tree='b'.repeat(40),
    r=>{for(const sample of r.observation.samples)sample.checked_at=new Date(Date.parse(sample.checked_at)-25*3600000).toISOString();},
    r=>r.observation.samples[0].status='unavailable',r=>r.observation.samples[0].evidence='',
    r=>delete r.observation.samples[0].duplicate_sends,r=>r.observation.samples[0].duplicate_sends=1,
    r=>r.observation.samples[0].critical_incidents=1,r=>r.observation.samples[0].data_loss_events=1];
  for(const mutate of cases){const value=report();mutate(value);assert.throws(()=>validate(value),/observation/);}
});
test('future-dated review cannot certify a pending check',()=>{
  const value=report();value.checks.security_audit.checked_at='2099-01-01';assert.throws(()=>validate(value),/pending/);
});
