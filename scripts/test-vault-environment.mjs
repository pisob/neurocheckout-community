import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeLocalData, loadLocalDataConfig, LocalDataStore } from './local-data-store.mjs';

test('vaults are environment-bound; switching environments cannot reuse keys', t => {
  const root = mkdtempSync(join(tmpdir(), 'nc-env-vault-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const environment of ['staging', 'production']) {
    const directory = join(root, environment);
    initializeLocalData(directory, 'same-shop', environment);
    const before = readFileSync(join(directory, 'local-data-keys.json'));
    const config = loadLocalDataConfig(directory, environment);
    assert.equal(config.environment, environment);
    const store = new LocalDataStore(directory, Date.now, environment);
    store.close();
    const other = environment === 'staging' ? 'production' : 'staging';
    assert.throws(() => loadLocalDataConfig(directory, other), /configuration_invalid/);
    assert.throws(() => new LocalDataStore(directory, Date.now, other), /configuration_invalid/);
    assert.throws(() => initializeLocalData(directory, 'same-shop', other), /EEXIST/);
    assert.deepEqual(readFileSync(join(directory, 'local-data-keys.json')), before);
  }
  assert.throws(() => initializeLocalData(join(root, 'invalid'), 'shop', 'prod'), /environment_invalid/);
  assert.throws(() => loadLocalDataConfig(join(root, 'staging'), 'development'), /environment_invalid/);
  assert.equal(loadLocalDataConfig(join(root, 'staging')).environment, 'staging');
  assert.throws(() => loadLocalDataConfig(join(root, 'production')), /configuration_invalid/);
});
