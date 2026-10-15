import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isConnectorKeyDpa } from '../lib/connector-key-dpa.ts';

const doc = {version:'1.2',html:'<p>Published</p>',source:'published',locale:'en',document_sha256:'a'.repeat(64),acceptance_text:'Accept version 1.2'};
test('only a complete published contract can be accepted', () => {
  assert.equal(isConnectorKeyDpa(doc),true);
  assert.equal(isConnectorKeyDpa({...doc,locale:'fr'}),true);
  for (const invalid of [null,{}, {...doc,source:'draft'},{...doc,version:''},{...doc,html:''},
    {...doc,document_sha256:'bad'},{...doc,acceptance_text:''},{...doc,locale:'de'}]) assert.equal(isConnectorKeyDpa(invalid),false);
});
test('the BFF forwards the displayed contract and never invents an acceptance', () => {
  const route=readFileSync(new URL('../app/api/cloud/connector-key/route.ts',import.meta.url),'utf8');
  for (const field of ['dpa_version','dpa_acceptance_text','dpa_document_sha256','dpa_locale']) assert.match(route,new RegExp(field+': payload\\.'+field));
  assert.doesNotMatch(route,/version 1\.0|dpa_version: "1\.0"/);
});
