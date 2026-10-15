import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceRetryDelay } from './source-pull-client.mjs';

test('tunnel backoff preserves heartbeats, sibling stores and immediate explicit recovery', async () => {
  // Execute the real worker with synthetic dependencies and a virtual clock.
  // Never open a real vault, network connection or production heartbeat.
  let now = 1000000, recovered = false;
  const timers = [], calls = [], heartbeats = [];
  const modules = {
    '@/scripts/workspace-store.mjs': {workspaceChildDirectories: () => ['quota-store', 'healthy-store']},
    '@/lib/workspace': {workspaceRoot: () => 'synthetic-workspace'},
    '@/lib/config': {workspaceEnabled: () => true, sessionSecret: () => 'fixture', cloudApiBaseUrl: () => 'https://cloud.invalid', communityClientId: () => 'fixture'},
    '@/scripts/server-data-relay.mjs': {relayOnce: async () => true},
    '@/scripts/server-availability.mjs': {heartbeatOnce: async ({directory}) => {heartbeats.push({directory, now}); return true;}},
    '@/scripts/source-pull-client.mjs': {
      sourceRetryDelay, pauseSourceReads: () => {},
      pullSourceOnce: async ({directory}) => {
        calls.push({directory, now});
        return directory === 'quota-store' && !recovered ? {ok: false, code: 'source_tunnel_quota_exhausted'} : {ok: true, complete: true};
      },
    },
    '@/package.json': {version: '0.0.0-test'},
  };
  const context = {exports: {}, Date: {now: () => now}, process: {env: {NC_DEPLOYMENT_ENV: 'staging', NC_LOCAL_DATA_PILOT_ENABLED: 'true', NC_CONNECTOR_PULL_ENABLED: 'true'}},
    require: name => {assert.ok(modules[name], 'Unexpected dependency: ' + name); return modules[name];},
    setTimeout: (callback, delay) => {const timer = {callback, due: now + delay, unref() {}}; timers.push(timer); return timer;},
    clearTimeout: timer => {const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1);},
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../lib/server-workspace.ts', import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, context);
  async function advance(ms) {
    const until = now + ms;
    let iterations = 0;
    while (true) {
      timers.sort((a, b) => a.due - b.due);
      if (!timers.length || timers[0].due > until) break;
      assert.ok(++iterations < 10000, 'Worker must not spin');
      const timer = timers.shift(); now = timer.due;
      await timer.callback();
      // scan() starts async loops without awaiting them, exactly as in production.
      await new Promise(resolve => setImmediate(resolve));
    }
    now = until;
  }
  context.exports.startWorkspaceWorkers();
  await advance(1000);
  assert.equal(calls.filter(c => c.directory === 'quota-store').length, 1);
  await advance(14 * 60000);
  assert.equal(calls.filter(c => c.directory === 'quota-store').length, 1);
  assert.ok(calls.filter(c => c.directory === 'healthy-store').length > 50);
  assert.ok(heartbeats.filter(c => c.directory === 'quota-store').length > 25);
  await advance(60000);
  assert.equal(calls.filter(c => c.directory === 'quota-store').length, 2);
  recovered = true;
  assert.equal(context.exports.requestWorkspaceRun('quota-store'), true);
  assert.equal(context.exports.requestWorkspaceRun('foreign-store'), false);
  await advance(0);
  assert.equal(calls.filter(c => c.directory === 'quota-store').length, 3);
  await advance(15000);
  assert.equal(calls.filter(c => c.directory === 'quota-store').length, 4);
});
