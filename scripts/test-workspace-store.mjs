import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, symlinkSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeLocalData, loadLocalDataConfig, LocalDataStore } from './local-data-store.mjs';
import { workspaceStoreDirectory, saveWorkspaceGrants, workspaceChildDirectories } from './workspace-store.mjs';

const a = { shop_id: 'woo-test', shop_uuid: '00000000-0000-4000-8000-000000000001', installation_id: '10000000-0000-4000-8000-000000000001' };
const b = { shop_id: 'magento-test', shop_uuid: '00000000-0000-4000-8000-000000000002', installation_id: '10000000-0000-4000-8000-000000000002' };
const fixture = () => mkdtempSync(join(tmpdir(), 'nc-workspace-test-'));

test('worker registry selects only initialized, currently listed child vaults', () => {
  const root = fixture();
  try {
    initializeLocalData(root, a.shop_id);
    const primary = new LocalDataStore(root);
    primary.bindInstallation(a.installation_id); primary.close();
    const child = workspaceStoreDirectory(root, b, { create: true });
    initializeLocalData(child, b.shop_id);
    const store = new LocalDataStore(child);
    store.bindInstallation(b.installation_id); store.close();
    assert.deepEqual(workspaceChildDirectories(root), []);
    saveWorkspaceGrants(root, [a, b]);
    assert.deepEqual(workspaceChildDirectories(root), [child]);
    saveWorkspaceGrants(root, [a]);
    assert.deepEqual(workspaceChildDirectories(root), []);
    assert.throws(() => saveWorkspaceGrants(root, [b, b]), /grants_invalid/);
    assert.throws(() => saveWorkspaceGrants(root, [{ ...b, shop_id: '../x' }]), /grants_invalid/);
    chmodSync(join(root, 'workspace-grants.json'), 0o644);
    assert.throws(() => workspaceChildDirectories(root), /private_file_required/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy vault stays intact; other shop gets distinct keys and references', () => {
  const root = fixture();
  try {
    initializeLocalData(root, a.shop_id);
    const legacy = new LocalDataStore(root);
    legacy.bindInstallation(a.installation_id);
    legacy.close();
    const before = readFileSync(join(root, 'local-data-keys.json'));
    assert.equal(workspaceStoreDirectory(root, a), root);
    const directory = workspaceStoreDirectory(root, b, { create: true });
    assert.notEqual(directory, root);
    initializeLocalData(directory, b.shop_id);
    assert.notEqual(loadLocalDataConfig(root).encryptionKey, loadLocalDataConfig(directory).encryptionKey);
    const first = new LocalDataStore(root), second = new LocalDataStore(directory);
    try {
      first.bindInstallation(a.installation_id);
      second.bindInstallation(b.installation_id);
      assert.notEqual(first.reference('cart', '42'), second.reference('cart', '42'));
      assert.throws(() => second.bindInstallation(a.installation_id));
    } finally { first.close(); second.close(); }
    assert.deepEqual(readFileSync(join(root, 'local-data-keys.json')), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy vault cannot be reused by another installation with the same shop slug', () => {
  const root = fixture();
  try {
    initializeLocalData(root, a.shop_id);
    assert.throws(() => workspaceStoreDirectory(root, a), /legacy_binding_required/);
    const store = new LocalDataStore(root);
    store.bindInstallation(a.installation_id);
    store.close();
    assert.throws(() => workspaceStoreDirectory(root, { ...a, installation_id: b.installation_id }), /legacy_binding_mismatch/);
    assert.equal(workspaceStoreDirectory(root, a), root);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid identities cannot select the default vault or traverse paths', () => {
  const root = fixture();
  try {
    for (const grant of [null, {}, { ...a, shop_uuid: '../x' }, { ...a, installation_id: '/tmp' }, { ...a, shop_id: '../shop' }]) {
      assert.throws(() => workspaceStoreDirectory(root, grant, { create: true }), /identity_invalid/);
    }
    assert.throws(() => workspaceStoreDirectory(root, b));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('symlink and shared directories are rejected', () => {
  const root = fixture(), outside = fixture();
  try {
    symlinkSync(outside, join(root, 'stores'));
    assert.throws(() => workspaceStoreDirectory(root, b, { create: true }), /private_directory_required/);
    rmSync(join(root, 'stores'));
    mkdirSync(join(root, 'stores'), { mode: 0o700 });
    chmodSync(join(root, 'stores'), 0o755);
    assert.throws(() => workspaceStoreDirectory(root, b, { create: true }), /private_directory_required/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
