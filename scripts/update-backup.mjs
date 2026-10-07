// Private, stopped-instance snapshots. Restoration never overwrites live data.
import { lstatSync, readdirSync, mkdirSync, copyFileSync, chmodSync, readFileSync, writeFileSync, statfsSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function files(root, prefix = '') {
  const result = [];
  for (const name of readdirSync(resolve(root, prefix))) {
    const path = resolve(root, prefix, name), stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new Error('backup_unsafe_path');
    if (stat.isDirectory()) result.push(...files(root, relative(root, path)));
    else if (stat.isFile()) result.push(relative(root, path));
    else throw new Error('backup_unsafe_path');
  }
  return result;
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function copyPrivate(source, destination) {
  if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error('backup_unsafe_path');
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(source, destination, 1);
  chmodSync(destination, 0o600);
}
export function updatePreflight(directory, minimumBytes = 2 * 1024 ** 3) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new Error('update_private_directory_required');
  const disk = statfsSync(directory);
  if (disk.bavail * disk.bsize < minimumBytes) throw new Error('update_disk_space_low');
}
export function verifyUpdateBackup(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error('backup_private_directory_required');
  const manifestStat = lstatSync(resolve(directory, 'manifest.json'));
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || (manifestStat.mode & 0o077) || manifestStat.uid !== process.getuid?.()) throw new Error('backup_private_directory_required');
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.files)) throw new Error('backup_invalid');
  const actual = files(directory).filter(name => name !== 'manifest.json').sort();
  const expected = manifest.files.map(entry => entry.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('backup_invalid');
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..') ||
        !/^(state\/|config\/)/.test(entry.path)) throw new Error('backup_invalid');
    const path = resolve(directory, entry.path);
    if ((lstatSync(path).mode & 0o077) || hash(path) !== entry.sha256) throw new Error('backup_invalid');
    if (entry.path.endsWith('.sqlite')) {
      // SQLite can create WAL/SHM files even when opened read-only. Verify a
      // disposable copy so the signed-by-hash snapshot remains unchanged.
      const check = mkdtempSync(resolve(tmpdir(),'nc-backup-check-'));
      let db;
      try {
        for (const suffix of ['', '-wal']) if (existsSync(path+suffix)) copyPrivate(path+suffix,resolve(check,'data.sqlite'+suffix));
        db = new DatabaseSync(resolve(check,'data.sqlite'));
        if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('backup_database_invalid');
      } finally { db?.close(); rmSync(check,{recursive:true,force:true}); }
    }
  }
  return manifest;
}
export function createUpdateBackup({ root, stateDirectory, destination }) {
  if (existsSync(stateDirectory)) {
    const stat = lstatSync(stateDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('backup_unsafe_path');
    const size = files(stateDirectory).reduce((sum,name)=>sum+lstatSync(resolve(stateDirectory,name)).size,0);
    const disk = statfsSync(dirname(destination));
    if (disk.bavail*disk.bsize < size*2+64*1024**2) throw new Error('update_disk_space_low');
  }
  mkdirSync(destination, { mode: 0o700 }); // New only; never replace another backup.
  if (existsSync(stateDirectory)) {
    if (!lstatSync(stateDirectory).isDirectory() || lstatSync(stateDirectory).isSymbolicLink()) throw new Error('backup_unsafe_path');
    const within = relative(stateDirectory, destination);
    if (!within.startsWith('..') && !isAbsolute(within)) throw new Error('backup_inside_source');
    for (const name of files(stateDirectory)) copyPrivate(resolve(stateDirectory, name), resolve(destination, 'state', name));
  }
  const environment = resolve(root, '.env.local');
  if (existsSync(environment)) copyPrivate(environment, resolve(destination, 'config', '.env.local'));
  const entries = files(destination).map(path => ({ path, sha256: hash(resolve(destination, path)) }));
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify({ schema: 1, files: entries }), { flag: 'wx', mode: 0o600 });
  verifyUpdateBackup(destination);
  // Exercise the recovery path before a candidate can touch any vault.
  const drill = mkdtempSync(resolve(dirname(destination), 'restore-check-'));
  try { restoreUpdateBackup(destination, resolve(drill, 'restored')); }
  finally { rmSync(drill, { recursive: true, force: true }); }
  return destination;
}
export function restoreUpdateBackup(source, destination) {
  const manifest = verifyUpdateBackup(source);
  mkdirSync(destination, { mode: 0o700 }); // Refuse existing/live destination.
  for (const entry of manifest.files) copyPrivate(resolve(source, entry.path), resolve(destination, entry.path));
  copyPrivate(resolve(source, 'manifest.json'), resolve(destination, 'manifest.json'));
  verifyUpdateBackup(destination);
  return destination;
}
