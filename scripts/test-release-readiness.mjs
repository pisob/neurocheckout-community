import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredChecks, validateStableReadiness } from './release-readiness.mjs';
function report() { return {schema:1,version:'0.1.0',source_tree:'a'.repeat(40),blockers:[],checks:Object.fromEntries(requiredChecks.map(name=>[name,{status:'passed',evidence:'Synthetic test evidence',reviewed_by:'test-maintainer',checked_at:'2026-10-07T12:00:00Z'}]))}; }
test('stable promotion requires every check including the user merchant journey',()=>{
  assert.equal(validateStableReadiness(report(),'0.1.0','a'.repeat(40)),true);
  for(const name of requiredChecks) {const value=report();value.checks[name].status='pending';assert.throws(()=>validateStableReadiness(value,'0.1.0','a'.repeat(40)),/readiness_pending/);}
  const value=report();value.blockers=['unresolved'];assert.throws(()=>validateStableReadiness(value,'0.1.0','a'.repeat(40)),/blockers/);
  assert.throws(()=>validateStableReadiness(report(),'0.1.0','b'.repeat(40)),/revision/);
  assert.throws(()=>validateStableReadiness(report(),'0.1.0-preview.29','a'.repeat(40)),/stable_version/);
});
