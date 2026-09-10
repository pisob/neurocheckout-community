import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { LocalDataStore, initializeLocalData, loadLocalDataConfig, mac } from "./local-data-store.mjs";
import { handleLocalData, signLocalRequest } from "./local-data-handler.mjs";

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-local-data-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  initializeLocalData(directory, "synthetic-shop");
  return directory;
}
const payload = { email: "synthetic-private@example.invalid", title: "PRIVATE-SYNTHETIC-PRODUCT", total: 83.21, status: "abandoned" };
const record = (extras = {}) => ({ kind: "cart", sourceId: "cart-private-0123", revision: 1,
  operation: "upsert", observedAt: new Date().toISOString(), payload, ...extras });

test("encrypted data survives restart; outbox contains references only", t => {
  const directory = fixture(t);
  let store = new LocalDataStore(directory);
  const input = record();
  const first = store.put(input);
  assert.match(first.reference, /^[a-f0-9]{64}$/);
  assert.equal(store.put(input).deduplicated, true);
  assert.equal(store.signals().length, 1);
  assert.equal(JSON.stringify(store.signals()).includes("PRIVATE"), false);
  for (const file of readdirSync(directory).filter(f => f.startsWith("local-data.sqlite"))) {
    const data = readFileSync(resolve(directory, file));
    for (const secret of [payload.email, payload.title, input.sourceId]) assert.equal(data.includes(Buffer.from(secret)), false);
  }
  store.close();
  store = new LocalDataStore(directory);
  assert.deepEqual(store.read({ kind: "cart", reference: first.reference, minimumRevision: 1 }).payload, payload);
  store.close();
  assert.throws(() => initializeLocalData(directory, "another-shop"), /EEXIST/);
});

test("versions, tombstones, retention and authenticated ciphertext fail closed", t => {
  const directory = fixture(t); let clock = Date.now();
  const store = new LocalDataStore(directory, () => clock); t.after(() => store.close());
  const input = record({ observedAt: new Date(clock).toISOString() });
  const { reference } = store.put(input);
  assert.throws(() => store.put({ ...input, payload: {} }), /revision_conflict/);
  assert.throws(() => store.read({ kind: "cart", reference, minimumRevision: 2 }), /not_ready/);
  store.put({ ...input, revision: 2, payload: { ...payload, status: "converted" } });
  assert.equal(store.read({ kind: "cart", reference, minimumRevision: 1 }).payload.status, "converted");
  assert.throws(() => store.put({ ...input, revision: 1 }), /revision_conflict/);
  store.put({ ...input, revision: 3, operation: "delete", payload: {} });
  assert.throws(() => store.read({ kind: "cart", reference, minimumRevision: 1 }), /record_deleted/);
  const product = store.put(record({ kind: "product", observedAt: input.observedAt }));
  store.db.prepare("UPDATE records SET revision=revision+1 WHERE kind='product'").run();
  assert.throws(() => store.read({ kind: "product", reference: product.reference, minimumRevision: 1 }));
  clock += 31 * 86400_000;
  assert.throws(() => store.read({ kind: "cart", reference, minimumRevision: 1 }), /record_missing/);
  store.cleanup();
  assert.equal(store.signals().length, 0);
  assert.equal(store.db.prepare("SELECT count(*) n FROM records").get().n, 0);
});

test("wrong keys, shop substitution and permissive files are refused", t => {
  const directory = fixture(t);
  const store = new LocalDataStore(directory); store.put(record()); store.close();
  const keyPath = resolve(directory, "local-data-keys.json");
  const config = loadLocalDataConfig(directory);
  writeFileSync(keyPath, JSON.stringify({ ...config, shopId: "other-shop" }));
  assert.throws(() => new LocalDataStore(directory), /key_mismatch/);
  writeFileSync(keyPath, JSON.stringify(config));
  chmodSync(keyPath, 0o644);
  assert.throws(() => new LocalDataStore(directory), /private_file/);
});

test("expired records and tombstones retain revision protection across restart and backup", t => {
  const directory = fixture(t); let clock = Date.now();
  let store = new LocalDataStore(directory, () => clock);
  const input = record({ revision: 5, observedAt: new Date(clock).toISOString() });
  const { reference } = store.put(input);
  store.put({ ...input, revision: 6, operation: "delete", payload: {} });
  clock += 31 * 86400_000;
  store.cleanup();
  assert.equal(store.db.prepare("SELECT count(*) n FROM records").get().n, 0);
  assert.equal(store.db.prepare("SELECT count(*) n FROM watermarks").get().n, 1);
  store.close();
  store = new LocalDataStore(directory, () => clock); t.after(() => store.close());
  const freshTimestamp = { ...input, observedAt: new Date(clock).toISOString() };
  for (const revision of [1, 5, 6]) assert.throws(() => store.put({ ...freshTimestamp, revision }), /revision_conflict/);
  assert.equal(store.signals().length, 0);
  const backup = resolve(directory, "watermark-backup");
  store.backup(backup);
  const restored = new LocalDataStore(backup, () => clock); t.after(() => restored.close());
  assert.throws(() => restored.put({ ...freshTimestamp, revision: 6 }), /revision_conflict/);
  store.put({ ...freshTimestamp, revision: 7 });
  assert.equal(store.read({ kind: "cart", reference, minimumRevision: 7 }).revision, 7);
  assert.equal(JSON.stringify(store.db.prepare("SELECT * FROM watermarks").all()).includes(input.sourceId), false);
});

function signed(directory, role, input, overrides = {}) {
  const config = loadLocalDataConfig(directory);
  const path = role === "write" ? "/api/local-data/v1/records" : "/api/local-data/v1/read";
  const body = typeof input === "string" ? input : JSON.stringify(input);
  const timestamp = overrides.timestamp || String(Date.now());
  const nonce = overrides.nonce || randomBytes(16).toString("hex");
  const secret = overrides.secret || (role === "write" ? config.ingestionKey : config.readKey);
  return new Request(`https://community.example.invalid${path}`, { method: "POST", body, headers: {
    "Content-Type": "application/json", "X-NC-Data-Time": timestamp, "X-NC-Data-Nonce": nonce,
    "X-NC-Data-Signature": signLocalRequest(secret, "POST", path, timestamp, nonce, body), ...overrides.headers,
  } });
}

test("signed API rejects replay and separated roles, verifies responses and resumes", async t => {
  const directory = fixture(t); const options = { directory, enabled: true, environment: "staging" };
  const write = signed(directory, "write", record());
  const clone = write.clone();
  const response = await handleLocalData(write, "write", options);
  assert.equal(response.status, 200);
  const inserted = await response.json();
  assert.equal((await handleLocalData(clone, "write", options)).status, 409);
  const input = { kind: "cart", reference: inserted.reference, minimumRevision: 1 };
  const request = signed(directory, "read", input);
  const nonce = request.headers.get("x-nc-data-nonce");
  const read = await handleLocalData(request, "read", options);
  assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store, private");
  const text = await read.text();
  assert.equal(read.headers.get("x-nc-data-response"), mac(loadLocalDataConfig(directory).readKey,
    `nc-local-data-response-v1\n${nonce}\n${createHash("sha256").update(text).digest("hex")}`));
  assert.deepEqual(JSON.parse(text).payload, payload);
  const unauthorized = signed(directory, "read", input, { secret: loadLocalDataConfig(directory).ingestionKey });
  assert.equal((await handleLocalData(unauthorized, "read", options)).status, 401);
  assert.equal((await handleLocalData(signed(directory, "write", record(), { headers: { Origin: "https://evil.invalid" } }), "write", options)).status, 403);
  assert.equal((await handleLocalData(signed(directory, "write", record(), { timestamp: String(Date.now() - 300_000) }), "write", options)).status, 401);
  assert.equal((await handleLocalData(signed(directory, "write", "{}"), "write", { ...options, environment: "production" })).status, 404);
  assert.equal((await handleLocalData(signed(directory, "write", "{}"), "write", { ...options, enabled: false })).status, 404);
  assert.equal((await handleLocalData(signed(directory, "write", "x".repeat(200 * 1024)), "write", options)).status, 413);
  assert.equal((await handleLocalData(signed(directory, "read", input), "read", options)).status, 200);
});

test("nonce and rate state persist independently of dashboard restarts", t => {
  const directory = fixture(t); let store = new LocalDataStore(directory);
  store.consumeNonce("write", "a".repeat(32)); store.close();
  store = new LocalDataStore(directory); t.after(() => store.close());
  assert.throws(() => store.consumeNonce("write", "a".repeat(32)), /replay/);
  for (let i = 0; i < 119; i++) store.consumeNonce("write", randomBytes(16).toString("hex"));
  assert.throws(() => store.consumeNonce("write", randomBytes(16).toString("hex")), /rate_limited/);
  store.consumeNonce("read", randomBytes(16).toString("hex"));
});

test("consistent backup is restorable and cannot overwrite live data", t => {
  const directory = fixture(t);
  const store = new LocalDataStore(directory); t.after(() => store.close());
  const { reference } = store.put(record());
  const backup = resolve(directory, "synthetic-backup");
  assert.deepEqual(store.backup(backup), { complete: true });
  assert.throws(() => store.backup(directory), /EEXIST/);
  const restored = new LocalDataStore(backup); t.after(() => restored.close());
  assert.deepEqual(restored.read({ kind: "cart", reference, minimumRevision: 1 }).payload, payload);
});

test("history is bounded and capacity refusal does not publish a signal", t => {
  const directory = fixture(t); const store = new LocalDataStore(directory); t.after(() => store.close());
  const input = record();
  for (let revision = 1; revision <= 14; revision++) store.put({ ...input, revision, payload: { revision } });
  assert.equal(store.db.prepare("SELECT count(*) n FROM history").get().n, 10);
  store.transaction(() => {
    const insert = store.db.prepare("INSERT INTO records VALUES ('product',?,1,'upsert',?,?,?,?)");
    for (let i = 0; i < 9999; i++) insert.run(String(i), Date.now(), Date.now() + 86400_000, "test-only", Buffer.from("synthetic"));
  });
  const before = store.signals().length;
  assert.throws(() => store.put({ ...input, sourceId: "over-capacity" }), /capacity_exceeded/);
  assert.equal(store.signals().length, before);
});

test("an idle upload is bounded in time and cancelled", async t => {
  const directory = fixture(t); let cancelled = false;
  const template = signed(directory, "write", "{}");
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request(template.url, { method: "POST", headers: template.headers, body, duplex: "half" });
  const started = Date.now();
  const response = await handleLocalData(request, "write", { directory, enabled: true, environment: "staging" });
  assert.equal(response.status, 408);
  assert.ok(Date.now() - started < 8000);
  assert.equal(cancelled, true);
});
