import { resolve } from 'node:path';
import { restoreUpdateBackup } from './update-backup.mjs';
try {
  if (process.argv.length !== 4) throw new Error('arguments_required');
  restoreUpdateBackup(resolve(process.argv[2]), resolve(process.argv[3]));
  console.log('Backup verified and restored to a new private directory. Live data was not changed.');
} catch {
  console.error('Restoration refused or incomplete. Keep the original backup. Use a new destination; never the live data directory.');
  process.exitCode = 1;
}
