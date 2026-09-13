import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { automaticSourceStatus, configureAutomaticSource } from "./automatic-source-setup.mjs";
import { LocalDataStore } from "./local-data-store.mjs";
import { SourceSynchronizer } from "./local-source-sync.mjs";

test("automatic setup creates, encrypts and rotates a shop-scoped source binding", t => {
  const directory = mkdtempSync(join(tmpdir(), "nc-auto-source-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = { schema: 1, shop_id: "euroka", platform: "prestashop",
    endpoint: "https://example.test/module/neurocheckoutconnector/communitydata", secret: "a".repeat(64) };
  assert.deepEqual(configureAutomaticSource(directory, first), { status: "synchronizing", shopId: "euroka" });
  assert.deepEqual(automaticSourceStatus(directory), { configured: true, ready: false, shopId: "euroka", lastSuccessAt: 0, lastCompleteAt: 0 });
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(directory, "local-data-keys.json")).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(directory, "local-data.sqlite")).includes(Buffer.from(first.secret)), false);
  let store = new LocalDataStore(directory);
  assert.deepEqual(new SourceSynchronizer(store).configuration(), { endpoint: first.endpoint, secret: first.secret });
  store.close();
  const rotated = { ...first, secret: "b".repeat(64) };
  configureAutomaticSource(directory, rotated);
  store = new LocalDataStore(directory);
  assert.deepEqual(new SourceSynchronizer(store).configuration(), { endpoint: first.endpoint, secret: rotated.secret });
  store.close();
});

test("automatic setup refuses a different shop and malformed credentials", t => {
  const directory = mkdtempSync(join(tmpdir(), "nc-auto-source-refusal-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const binding = { schema: 1, shop_id: "euroka", endpoint: "https://example.test/module/neurocheckoutconnector/communitydata", secret: "c".repeat(64) };
  configureAutomaticSource(directory, binding);
  assert.throws(() => configureAutomaticSource(directory, { ...binding, shop_id: "other" }), /shop_mismatch/);
  assert.throws(() => configureAutomaticSource(directory, { ...binding, secret: "weak" }), /binding_invalid/);
});

test("status is safe before setup", t => {
  const directory = mkdtempSync(join(tmpdir(), "nc-auto-source-empty-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.deepEqual(automaticSourceStatus(directory), { configured: false, ready: false });
});
