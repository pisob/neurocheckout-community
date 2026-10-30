import assert from 'node:assert/strict';
import test from 'node:test';
import {memberMessageAction} from '../lib/member-message-action.ts';

test('business alerts open local performance for the message store',()=>{
 const action=memberMessageAction({kind:'business_alert_incident:notice',shop_id:'store & two',upgrade_href:'/dashboard/overview?agent=business-alerts#agent-kpis',upgrade_label:'Consulter'},'fr',true);
 const target=new URL(action.href,'http://localhost:3400/');
 assert.equal(target.hash,'#agent-performance');assert.equal(target.searchParams.get('notice_shop'),'store & two');
 assert.equal(target.searchParams.get('notice_agent'),'business_alerts_anomalies');assert.equal(action.label,'Consulter');assert.equal(action.external,false);
 assert.equal(memberMessageAction({kind:'business_alert_incident:notice',upgrade_href:'/dashboard/overview'},'en',false).href,'#overview');
});
test('account notices retain the configured account action',()=>{
 assert.equal(memberMessageAction({kind:'trial_email_limit_reached',upgrade_href:'/onboarding/subscription?shop_id=one'},'en',true).href,'/api/upgrade');
});
test('unrecognized destinations never become clickable redirects',()=>{
 for(const href of ['javascript:alert(1)','https://example.invalid/','//example.invalid','/\\example.invalid','/api/private-operation']) {
  assert.equal(memberMessageAction({upgrade_href:href},'en',true),null);
 }
});
