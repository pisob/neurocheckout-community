// Resolve only server-authorized identities. This module does not grant access.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { loadLocalDataConfig, LocalDataStore } from './local-data-store.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function privateDirectory(path, create) {
  if (create) {
    try { mkdirSync(path, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) {
    throw new Error('workspace_private_directory_required');
  }
}

export function workspaceStoreDirectory(root, grant, { create = false } = {}) {
  if (!grant || typeof grant.shop_uuid !== 'string' || typeof grant.installation_id !== 'string' ||
      typeof grant.shop_id !== 'string' || !uuid.test(grant.shop_uuid) || !uuid.test(grant.installation_id) ||
      !slug.test(grant.shop_id)) throw new Error('workspace_identity_invalid');
  const directory = resolve(root);
  privateDirectory(directory, false);
  // Keep the original vault in place: never move, overwrite or regenerate keys.
  if (existsSync(resolve(directory, 'local-data-keys.json'))) {
    const legacy = loadLocalDataConfig(directory);
    if (legacy.shopId === grant.shop_id) {
      // A recycled shop slug or a new installation must not open the old vault.
      // An unbound legacy vault needs explicit setup before workspace use.
      if (!existsSync(resolve(directory, 'local-data.sqlite'))) {
        throw new Error('workspace_legacy_binding_required');
      }
      const store = new LocalDataStore(directory);
      try {
        const binding = store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get();
        if (binding?.value !== grant.installation_id) throw new Error('workspace_legacy_binding_mismatch');
      } finally { store.close(); }
      return directory;
    }
  }
  let current = directory;
  for (const segment of ['stores', grant.shop_uuid, grant.installation_id]) {
    current = resolve(current, segment);
    privateDirectory(current, create);
  }
  return current;
}

function validGrants(grants) {
  return Array.isArray(grants) && grants.length <= 64 && grants.every(g => g &&
    typeof g.shop_uuid === 'string' && uuid.test(g.shop_uuid) && typeof g.installation_id === 'string' && uuid.test(g.installation_id) &&
    typeof g.shop_id === 'string' && slug.test(g.shop_id)) &&
    new Set(grants.map(g => g.shop_uuid)).size === grants.length &&
    new Set(grants.map(g => g.installation_id)).size === grants.length;
}

// Metadata only, not credentials or authorization. Cloud still revalidates every
// background request. An explicit list avoids polling historical/revoked vaults.
export function saveWorkspaceGrants(root, grants) {
  if (!validGrants(grants)) throw new Error('workspace_grants_invalid');
  const directory = resolve(root); privateDirectory(directory, false);
  const temporary = resolve(directory, `workspace-${randomBytes(12).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(grants.map(({ shop_uuid, shop_id, installation_id }) => ({ shop_uuid, shop_id, installation_id }))), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, resolve(directory, 'workspace-grants.json'));
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export function workspaceChildDirectories(root) {
  const directory = resolve(root), result = [];
  privateDirectory(directory, false);
  const file = resolve(directory, 'workspace-grants.json');
  if (!existsSync(file)) return result;
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let grants;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 32768 || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error('workspace_private_file_required');
    grants = JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
  if (!validGrants(grants)) throw new Error('workspace_grants_invalid');
  for (const grant of grants) {
    try {
      const child = workspaceStoreDirectory(directory, grant);
      if (child === directory) continue;
      const store = new LocalDataStore(child);
      try {
        const binding = store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get();
        if (binding?.value === grant.installation_id) result.push(child);
      } finally { store.close(); }
    } catch { /* An incomplete or unsafe vault is never polled. */ }
  }
  return result;
}
