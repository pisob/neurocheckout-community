import { resolve } from "node:path";
import { LocalDataStore } from "./local-data-store.mjs";
let store;
try {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.argv.length !== 3) throw new Error("staging_backup_required");
  const directory = process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
  store = new LocalDataStore(directory);
  store.backup(process.argv[2]);
  process.stdout.write("Consistent encrypted backup and private keys saved. Keep the backup private.\n");
} catch {
  process.stderr.write("Backup failed. Use a new absolute destination; any incomplete backup must not be used for restoration. Source data was not deleted.\n");
  process.exitCode = 1;
} finally { store?.close(); }
