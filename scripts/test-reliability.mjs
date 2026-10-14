import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliabilityStages, quotaObservation, emailStatusTotal } from '../lib/reliability.ts';

const now=100_000;
test('missing email observations never become zero conversions',()=>{
  const counts={sent:2,delivered:0,opened:1,clicked:0,converted:1,bounced:0};
  assert.equal(emailStatusTotal(counts,'all'),4);
  assert.equal(emailStatusTotal(counts,'clicked'),0);
  assert.equal(emailStatusTotal(undefined,'converted'),null);
  assert.equal(emailStatusTotal({...counts,converted:null},'all'),null);
  assert.equal(emailStatusTotal({...counts,converted:NaN},'converted'),null);
});
const cloud={online:true,queue:{pending:0,processing:0,retrying:0,failed:0},data_quality:{incomplete:0},evidence:{received:1,sent:1,converted:1}};
const local={available:true,configured:true,ready:true,shop_id:'shop-a',source:{last_complete_at:now,diagnostic:{code:'ok',checked_at:now}},outbox:{pending:0}};
const stages=(c=cloud,l=local,shop='shop-a')=>Object.fromEntries(reliabilityStages(c,l,shop,now).map(s=>[s.id,s.state]));
test('heartbeat never authorizes sending; data freshness, store scope and pending work are independent',()=>{
  assert.equal(stages().connection,'verified'); assert.equal(stages().eligibility,'pending');
  assert.equal(stages(cloud,local,'shop-b').source,'unknown');
  assert.equal(stages(cloud,{...local,source:{...local.source,last_complete_at:now-61_000}}).processing,'blocked');
  assert.equal(stages({...cloud,queue:{...cloud.queue,processing:1}}).processing,'pending');
  assert.equal(stages(cloud,{...local,outbox:{pending:1}}).processing,'pending');
  assert.equal(stages(null).conversion,'unknown');
  assert.equal(stages({...cloud,latest_issue:'quota_blocked',issue_active:false}).eligibility,'pending');
  assert.equal(stages({...cloud,latest_issue:'delivery_uncertain',issue_active:true}).eligibility,'blocked');
});
test('stale or failed quota reads are unknown, never zero or current historical data',()=>{
  const emails={used:12,remaining:88};
  assert.equal(quotaObservation(emails,now,false,now,90_000).used,12);
  for(const result of [quotaObservation(emails,now,true,now,90_000),quotaObservation(emails,1,false,now,90_000),quotaObservation(emails,null,false,now,90_000)]) {
    assert.equal(result.used,null);assert.equal(result.remaining,null);assert.equal(result.fresh,false);
  }
  assert.equal(quotaObservation({used:0},now,false,now,90_000).used,0);
  assert.equal(quotaObservation({used:NaN},now,false,now,90_000).used,null);
});
