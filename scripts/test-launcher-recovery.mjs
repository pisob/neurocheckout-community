import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

test('launcher restarts the previous build when selected build exits during startup', async () => {
  const root=mkdtempSync(resolve(tmpdir(),'nc-startup-recovery-'));
  const reserve=createServer(); await new Promise(done=>reserve.listen(0,'127.0.0.1',done));
  const port=reserve.address().port; await new Promise(done=>reserve.close(done));
  const updates=resolve(root,'.community-updates'),candidate=resolve(updates,'release-test','source');
  mkdirSync(resolve(candidate,'.next','standalone'),{recursive:true,mode:0o700});
  mkdirSync(resolve(root,'.next','standalone'),{recursive:true,mode:0o700});
  writeFileSync(resolve(candidate,'.next','standalone','server.js'),'process.exit(1)');
  for (const source of [root,candidate]) writeFileSync(resolve(source,'package.json'),JSON.stringify({version:'0.1.0-preview.29'}));
  writeFileSync(resolve(root,'.next','standalone','server.js'),`require('http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,service:'neurocheckout-community',version:'0.1.0-preview.29'}));}).listen(${port},'127.0.0.1');`);
  writeFileSync(resolve(updates,'current.json'),JSON.stringify({path:'release-test/source',previous:'..'}),{mode:0o600});
  const child=spawn(process.execPath,[resolve('scripts/start-standalone.mjs')],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),HOSTNAME:'127.0.0.1'},stdio:'ignore'});
  try {
    let recovered=false;
    for(let i=0;i<40;i++) {
      await delay(250);
      assert.equal(child.exitCode,null);
      try { recovered=JSON.parse(readFileSync(resolve(updates,'status.json'),'utf8')).phase==='rolled_back'; } catch {}
      if(recovered) break;
    }
    assert.equal(recovered,true);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status,200);
    assert.equal(JSON.parse(readFileSync(resolve(updates,'current.json'),'utf8')).path,'..');
  } finally {
    if(child.exitCode===null) {const exited=new Promise(done=>child.once('exit',done));child.kill('SIGTERM');await exited;}
    rmSync(root,{recursive:true,force:true});
  }
});
