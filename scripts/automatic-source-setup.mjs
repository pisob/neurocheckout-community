import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeLocalData, LocalDataStore } from "./local-data-store.mjs";
import { SourceSynchronizer } from "./local-source-sync.mjs";

export function configureAutomaticSource(directory, binding) {
  if (!binding || binding.schema !== 1 || typeof binding.shop_id !== "string" ||
      typeof binding.endpoint !== "string" || typeof binding.secret !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(binding.shop_id) ||
      !/^[a-f0-9]{64}$/.test(binding.secret)) throw new Error("automatic_source_binding_invalid");
  if (!existsSync(resolve(directory, "local-data-keys.json"))) initializeLocalData(directory, binding.shop_id);
  const store = new LocalDataStore(directory);
  try {
    if (store.config.shopId !== binding.shop_id) throw new Error("local_data_shop_mismatch");
    new SourceSynchronizer(store).configure({ endpoint: binding.endpoint, secret: binding.secret });
    return { status: "synchronizing", shopId: binding.shop_id };
  } finally {
    store.close();
  }
}

export function automaticSourceStatus(directory) {
  if (!existsSync(resolve(directory, "local-data-keys.json"))) return { configured: false, ready: false };
  let store;
  try {
    store = new LocalDataStore(directory);
    const bound = Boolean(store.db.prepare("SELECT 1 FROM source_binding WHERE id=1").get());
    const sync = bound ? store.db.prepare("SELECT ready,last_success_at,last_complete_at FROM source_sync WHERE id=1").get() : null;
    return { configured: bound, ready: sync?.ready === 1, shopId: store.config.shopId,
      lastSuccessAt: Number(sync?.last_success_at || 0), lastCompleteAt: Number(sync?.last_complete_at || 0) };
  } catch {
    return { configured: false, ready: false };
  } finally {
    store?.close();
  }
}
