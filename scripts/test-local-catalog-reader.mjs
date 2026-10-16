import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { initializeLocalData, LocalDataStore } from "./local-data-store.mjs";
import { readLocalCatalog, CATALOG_PAGE_BYTES } from "./local-catalog-reader.mjs";
import { SourceSynchronizer } from "./local-source-sync.mjs";

const installation = "11111111-1111-4111-8111-111111111111";
function fixture(t, shop = "catalog-test") {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-catalog-test-"));
  initializeLocalData(directory, shop, "staging");
  let now = Date.now();
  const store = new LocalDataStore(directory, () => now, "staging");
  store.bindInstallation(installation);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory, advance: ms => { now += ms; }, put(id, revision = 1, payload = { name: "Private product" }, operation = "upsert", kind = "product") {
    return store.put({ kind, sourceId: String(id), revision, payload, operation, observedAt: new Date(now).toISOString() });
  } };
}

test("all 2045 products are paginated without sampling, carts or plaintext persistence", t => {
  const f = fixture(t);
  for (let id = 1; id <= 2045; id++) f.put(id, 1, { source_schema: "magento-native-v1", entity_id: id, name: `Private catalog product ${id}` });
  f.put("private-cart", 1, { email: "private@example.invalid" }, "upsert", "cart");
  let cursor = "", generation, pages = 0;
  const records = [];
  do {
    const page = readLocalCatalog(f.store, { cursor });
    assert.equal(page.shopId, "catalog-test"); assert.equal(page.installationId, installation);
    assert.equal(page.count, 2045); assert.ok(page.records.length <= 32);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= CATALOG_PAGE_BYTES);
    generation ||= page.generation; assert.equal(page.generation, generation);
    records.push(...page.records); cursor = page.nextCursor; pages++;
  } while (cursor);
  assert.equal(pages, 64); assert.equal(records.length, 2045);
  assert.equal(new Set(records.map(r => r.reference)).size, 2045);
  assert.deepEqual(records.map(r => r.reference), records.map(r => r.reference).sort());
  assert.ok(records.every(r => r.kind === "product"));
  assert.equal(new Set(records.map(r => r.payload.entity_id)).size, 2045);
  f.store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const bytes = readFileSync(resolve(f.directory, "local-data.sqlite"));
  assert.equal(bytes.includes(Buffer.from("Private catalog product")), false);
  assert.equal(bytes.includes(Buffer.from("private@example.invalid")), false);
});

test("page budget accounts for UTF-8 and yields a cursor for large native records", t => {
  const f = fixture(t);
  for (let id = 1; id <= 3; id++) f.put(id, 1, { name: "é".repeat(55_000) });
  let cursor = "";
  for (let id = 1; id <= 3; id++) {
    const page = readLocalCatalog(f.store, { cursor });
    assert.equal(page.records.length, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= CATALOG_PAGE_BYTES);
    cursor = page.nextCursor;
    assert.equal(!!cursor, id < 3);
  }
});

test("empty, deleted and expired products are not fabricated", t => {
  const f = fixture(t);
  assert.equal(readLocalCatalog(f.store, { cursor: "" }).count, 0);
  f.put(1); f.put(1, 2, {}, "delete"); f.put(2);
  assert.equal(readLocalCatalog(f.store, { cursor: "" }).count, 1);
  f.advance(31 * 86400_000);
  const page = readLocalCatalog(f.store, { cursor: "" });
  assert.equal(page.count, 0); assert.deepEqual(page.records, []); assert.equal(page.nextCursor, "");
});

for (const change of ["update", "delete", "insert", "expire"]) test(`a ${change} invalidates a continuation instead of mixing catalogs`, t => {
  const f = fixture(t);
  for (let id = 1; id <= 34; id++) f.put(id);
  const page = readLocalCatalog(f.store, { cursor: "" });
  if (change === "update") f.put(1, 2, { name: "Changed private product" });
  if (change === "delete") f.put(1, 2, {}, "delete");
  if (change === "insert") f.put(35);
  if (change === "expire") f.advance(120_001);
  assert.throws(() => readLocalCatalog(f.store, { cursor: page.nextCursor }), /local_catalog_changed/);
});

test("unrelated cart changes do not invalidate a product snapshot", t => {
  const f = fixture(t);
  for (let id = 1; id <= 33; id++) f.put(id);
  const page = readLocalCatalog(f.store, { cursor: "" });
  f.put("cart", 1, { email: "private@example.invalid" }, "upsert", "cart");
  const last = readLocalCatalog(f.store, { cursor: page.nextCursor });
  assert.equal(last.generation, page.generation); assert.equal(last.records.length, 1);
});

test("cursor tampering, foreign vaults and unknown selectors fail closed", t => {
  const f = fixture(t), other = fixture(t, "another-shop");
  for (let id = 1; id <= 33; id++) f.put(id);
  const cursor = readLocalCatalog(f.store, { cursor: "" }).nextCursor;
  assert.throws(() => readLocalCatalog(other.store, { cursor }), /local_catalog_invalid/);
  const tampered = cursor.slice(0, -1) + (cursor.endsWith("a") ? "b" : "a");
  for (const input of [{ cursor: tampered }, { cursor: true }, { cursor: null }, {}, [], { cursor: "x".repeat(513) },
    { cursor: "", shopId: "another-shop" }, { cursor: "", kind: "cart" }, { cursor: "", limit: 99999 }]) {
    assert.throws(() => readLocalCatalog(f.store, input), /local_catalog_invalid/);
  }
  f.store.db.prepare("UPDATE meta SET value=? WHERE name='installation_id'").run("22222222-2222-4222-8222-222222222222");
  assert.throws(() => readLocalCatalog(f.store, { cursor }), /local_catalog_invalid/);
});

test("a stale or synchronizing source never returns a successful empty catalog", t => {
  const f = fixture(t);
  new SourceSynchronizer(f.store).configure({ endpoint: "https://example.com/neurocheckout/community/pull", secret: "a".repeat(64) });
  assert.throws(() => readLocalCatalog(f.store, { cursor: "" }), /local_data_source_unavailable/);
  f.store.db.prepare("UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1").run(f.store.clock());
  assert.equal(readLocalCatalog(f.store, { cursor: "" }).count, 0);
  f.advance(60_001);
  assert.throws(() => readLocalCatalog(f.store, { cursor: "" }), /local_data_source_unavailable/);
});
