import { resolve } from "node:path";
import { initializeLocalData, LocalDataStore } from "./local-data-store.mjs";
if (process.env.NC_DEPLOYMENT_ENV !== "staging") {
  process.stderr.write("Local data is a staging-only pilot. No files changed.\n"); process.exitCode = 1;
} else {
  try {
    const shopId = process.argv[2];
    if (process.argv.length !== 3) throw new Error("Usage: npm run setup:local-data -- SHOP_ID");
    const directory = process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
    initializeLocalData(directory, shopId);
    const store = new LocalDataStore(directory); store.close();
    process.stdout.write("Staging local vault initialized. Private keys were saved server-side, not printed.\nNo connector was redirected; no Cloud automation was enabled.\n");
  } catch { process.stderr.write("Local vault setup failed. Check the shop ID, private directory and existing state; keys are never overwritten.\n"); process.exitCode = 1; }
}
