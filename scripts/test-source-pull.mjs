import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { LocalDataStore, initializeLocalData } from "./local-data-store.mjs";
import { handleLocalData, signLocalRequest } from "./local-data-handler.mjs";
import { SourceSynchronizer, connectorEndpoint } from "./local-source-sync.mjs";
import { pullSourceOnce, pauseSourceReads, postSourcePage, publicSourceTarget, sourceResponseSignature, sourceRequestSignature } from "./source-pull-client.mjs";

const source = { endpoint: "https://store.example.invalid/module/neurocheckoutconnector/communitydata", secret: "ab".repeat(32) };
const streamId = "a".repeat(32), cursor1 = "b".repeat(64), cursor2 = "c".repeat(64);
const payload = { email: "synthetic-private@example.invalid", status: "abandoned", name: "SYNTHETIC-PRIVATE-PRODUCT" };
const record = (changes = {}) => ({ kind: "cart", sourceId: "private-cart-id", revision: 1,
  operation: "upsert", observedAt: new Date().toISOString(), payload, ...changes });
const page = (changes = {}) => ({ schema: 1, shopId: "synthetic-shop", streamId, cursor: "", nextCursor: cursor1,
  complete: true, generatedAt: new Date().toISOString(), records: [record()], ...changes });

function fixture(t, clock = Date.now) {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-source-pull-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  initializeLocalData(directory, "synthetic-shop");
  const store = new LocalDataStore(directory, clock);
  const sync = new SourceSynchronizer(store); sync.configure(source);
  t.after(() => store.close());
  return { directory, store, sync };
}

test("page contents, reference signals and cursor commit atomically", t => {
  const { store, sync } = fixture(t);
  const input = record(), lease = sync.claim();
  assert.throws(() => sync.apply(page({ records: [input, record({ sourceId: "another", revision: 0 })] }), lease));
  assert.equal(store.db.prepare("SELECT count(*) n FROM records").get().n, 0);
  assert.equal(store.signals().length, 0);
  assert.equal(store.db.prepare("SELECT cursor FROM source_sync").get().cursor, "");
  assert.deepEqual(sync.apply(page({ records: [input] }), lease), { count: 1, complete: true });
  const reference = store.reference("cart", input.sourceId);
  assert.deepEqual(store.read({ kind: "cart", reference, minimumRevision: 1 }).payload, payload);
  assert.equal(store.signals().length, 1);
  assert.throws(() => store.put(record()), /source_managed/);
  assert.throws(() => store.putInTransaction(record()), /transaction_required/);
});

test("incomplete catch-up and failed synchronization block reads, then conversion resumes safely", t => {
  let clock = Date.now();
  const { store, sync } = fixture(t, () => clock);
  const input = record({ observedAt: new Date(clock).toISOString() });
  sync.apply(page({ generatedAt: input.observedAt, complete: false, records: [input] }), sync.claim());
  const query = { kind: "cart", reference: store.reference("cart", input.sourceId), minimumRevision: 1 };
  assert.throws(() => store.read(query), /source_unavailable/);
  const stopped = sync.claim(); sync.failed(stopped);
  assert.throws(() => store.read(query), /source_unavailable/);
  sync.apply(page({ cursor: cursor1, nextCursor: cursor2, records: [
    { ...input, revision: 2, payload: { ...payload, status: "converted" } },
  ] }), sync.claim());
  assert.equal(store.read(query).payload.status, "converted");
  clock += 61_000;
  assert.throws(() => store.read(query), /source_unavailable/);
  sync.apply(page({ cursor: cursor2, nextCursor: cursor2, records: [], generatedAt: new Date(clock).toISOString() }), sync.claim());
  assert.equal(store.read(query).payload.status, "converted");
});

test("leases prevent concurrent pollers and reject late replies after restart", t => {
  let clock = Date.now();
  const { directory, store, sync } = fixture(t, () => clock);
  const first = sync.claim();
  const secondStore = new LocalDataStore(directory, () => clock); t.after(() => secondStore.close());
  const second = new SourceSynchronizer(secondStore);
  assert.throws(() => second.claim(), /busy/);
  clock += 31_000;
  const newLease = second.claim();
  assert.throws(() => sync.apply(page({ generatedAt: new Date(clock).toISOString() }), first));
  sync.failed(first);
  assert.equal(store.db.prepare("SELECT lease_token FROM source_sync").get().lease_token, newLease.token);
  second.apply(page({ generatedAt: new Date(clock).toISOString() }), newLease);
  assert.equal(store.signals().length, 1);
});

test("shop, stream, cursor, shape and freshness substitution cannot advance the cursor", t => {
  const { store, sync } = fixture(t);
  sync.apply(page(), sync.claim());
  const lease = sync.claim();
  const valid = page({ cursor: cursor1, nextCursor: cursor2, records: [] });
  for (const invalid of [
    { shopId: "other-shop" }, { streamId: "f".repeat(32) }, { cursor: "" },
    { url: "http://169.254.169.254" }, { generatedAt: new Date(Date.now() - 31_000).toISOString() },
    { complete: false, nextCursor: cursor1 }, { records: Array.from({ length: 9 }, () => record()) },
  ]) assert.throws(() => sync.apply({ ...valid, ...invalid }, lease));
  assert.equal(store.db.prepare("SELECT cursor FROM source_sync").get().cursor, cursor1);
  sync.apply(valid, lease);
});

test("source binding and full data stay encrypted and survive consistent backup", t => {
  const { directory, store, sync } = fixture(t);
  sync.apply(page(), sync.claim());
  for (const name of readdirSync(directory).filter(name => name.startsWith("local-data.sqlite"))) {
    const raw = readFileSync(resolve(directory, name));
    for (const value of [source.secret, source.endpoint, payload.email, payload.name, "private-cart-id"]) assert.equal(raw.includes(Buffer.from(value)), false);
  }
  const backup = resolve(directory, "backup"); store.backup(backup);
  const restored = new LocalDataStore(backup); t.after(() => restored.close());
  const restoredSync = new SourceSynchronizer(restored);
  assert.deepEqual(restoredSync.configuration(), source);
  assert.equal(restoredSync.claim().cursor, cursor1);
  assert.throws(() => sync.configure({ ...source, endpoint: source.endpoint.replace("store.", "another.") }));
  sync.configure({ ...source, secret: "cd".repeat(32) });
  assert.equal(sync.configuration().secret, "cd".repeat(32));
  assert.throws(() => store.read({ kind: "cart", reference: store.reference("cart", "private-cart-id"), minimumRevision: 1 }), /source_unavailable/);
});

test("signed outgoing pull recovers, rejects response replay and never advances on bad authentication", async t => {
  const { directory, store } = fixture(t);
  const options = { directory, enabled: true, environment: "staging" };
  let previousSignature;
  const transport = async (url, body, headers) => {
    assert.equal(url, source.endpoint);
    const request = JSON.parse(body);
    assert.equal(request.limit, 8);
    assert.equal(headers["X-NC-Source-Signature"], sourceRequestSignature(source.secret, connectorEndpoint(url).pathname,
      "synthetic-shop", headers["X-NC-Source-Time"], headers["X-NC-Source-Nonce"], body));
    assert.equal(JSON.stringify(headers).includes(source.secret), false);
    const output = Buffer.from(JSON.stringify(page(request.cursor ? { cursor: request.cursor, records: [], nextCursor: request.cursor } : {})));
    const signature = sourceResponseSignature(source.secret, headers["X-NC-Source-Nonce"], output);
    previousSignature = signature;
    return { body: output, signature };
  };
  assert.equal((await pullSourceOnce(options, transport)).ok, true);
  assert.equal((await pullSourceOnce(options, async () => { throw new Error(payload.email); })).ok, false);
  assert.throws(() => store.requireSourceFresh(), /source_unavailable/);
  assert.equal((await pullSourceOnce(options, transport)).ok, true);
  assert.equal((await pullSourceOnce(options, async () => ({ body: Buffer.from(JSON.stringify(page())), signature: previousSignature }))).ok, false);
  assert.equal(store.db.prepare("SELECT cursor FROM source_sync").get().cursor, cursor1);
  for (const changes of [{ enabled: false }, { environment: "production" }]) {
    assert.equal((await pullSourceOnce({ ...options, ...changes }, () => assert.fail("no network"))).ok, false);
  }
});

test("DNS pinning refuses private, mixed, reserved and IPv6 destinations without HTTP", async () => {
  const endpoint = source.endpoint;
  const good = { address: "93.184.216.34", family: 4 };
  assert.equal((await publicSourceTarget(endpoint, async () => [good])).address, good.address);
  for (const address of ["127.0.0.1", "10.1.1.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "::1", "2001:4860:4860::8888"]) {
    await assert.rejects(publicSourceTarget(endpoint, async () => [good, { address }]));
  }
  for (const invalid of ["http://store.example.invalid/module/neurocheckoutconnector/communitydata", source.endpoint + "?url=other",
    source.endpoint.replace("store.", "user:secret@store."), source.endpoint.replace("communitydata", "orderhistory")]) {
    await assert.rejects(publicSourceTarget(invalid, () => assert.fail("no DNS for invalid endpoint")));
  }
});

test("startup invalidates a recently restored sync status before serving reads", t => {
  const { directory, store, sync } = fixture(t);
  sync.apply(page(), sync.claim());
  store.requireSourceFresh();
  pauseSourceReads({ enabled: true, environment: "staging", directory });
  assert.throws(() => store.requireSourceFresh(), /source_unavailable/);
  sync.apply(page({ cursor: cursor1, nextCursor: cursor1, records: [] }), sync.claim());
  store.requireSourceFresh();
});

test("an existing manually populated vault cannot silently become source-managed", t => {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-source-migration-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  initializeLocalData(directory, "synthetic-shop");
  const store = new LocalDataStore(directory); t.after(() => store.close());
  store.put(record());
  const sync = new SourceSynchronizer(store);
  assert.throws(() => sync.configure(source), /migration_required/);
  assert.equal(store.db.prepare("SELECT count(*) n FROM source_binding").get().n, 0);
  assert.equal(store.db.prepare("SELECT 1 FROM meta WHERE name='source_pull_bound'").get(), undefined);
  assert.equal(store.read({ kind: "cart", reference: store.reference("cart", "private-cart-id"), minimumRevision: 1 }).payload.status, "abandoned");
});

function httpFixture({ status = 200, headers = {}, chunks = [Buffer.from("{}")], aborted = false } = {}) {
  let destroyed = false, options;
  return {
    get options() { return options; }, get destroyed() { return destroyed; },
    resolveTarget: async () => ({ url: new URL(source.endpoint), address: "93.184.216.34" }),
    httpsRequest: (input, callback) => {
      options = input;
      const req = new EventEmitter();
      req.destroy = () => { destroyed = true; };
      req.end = () => queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = status;
        res.headers = { "content-type": "application/json", "x-nc-source-response": "a".repeat(64), ...headers };
        res.destroy = () => { destroyed = true; };
        callback(res);
        if (destroyed) return;
        if (aborted) { res.emit("aborted"); return; }
        for (const chunk of chunks) { res.emit("data", chunk); if (destroyed) return; }
        res.emit("end");
      });
      return req;
    },
  };
}

test("HTTPS transport pins DNS while preserving hostname verification and a total deadline", async () => {
  const fixture = httpFixture();
  assert.equal((await postSourcePage(source.endpoint, "{}", {}, fixture)).body.toString(), "{}");
  assert.equal(fixture.options.hostname, "store.example.invalid");
  assert.equal(fixture.options.servername, "store.example.invalid");
  assert.equal(fixture.options.rejectUnauthorized, true);
  assert.equal(fixture.options.agent, false);
  assert.ok(fixture.options.signal instanceof AbortSignal);
  let resolved;
  fixture.options.lookup("ignored.example.invalid", {}, (error, address, family) => { assert.equal(error, null); resolved = { address, family }; });
  assert.deepEqual(resolved, { address: "93.184.216.34", family: 4 });
});

test("all three source routes accept public HTTPS only and preserve the signed path", async () => {
  for (const path of ["/module/neurocheckoutconnector/communitydata", "/neurocheckout/community/pull", "/wp-json/neurocheckout/v1/communitydata"]) {
    for (const prefix of ["", "/shop/en"]) {
      const endpoint = "https://store.example.invalid" + prefix + path;
      const target = await publicSourceTarget(endpoint, async () => [{ address: "93.184.216.34", family: 4 }]);
      assert.equal(target.url.pathname, prefix + path);
      for (const suffix of ["?store_id=2", "#fragment", "/", "%2fother"]) {
        await assert.rejects(publicSourceTarget(endpoint + suffix, () => assert.fail("no DNS for invalid route")));
      }
    }
  }
});

test("redirects, compressed bodies, oversized streams and broken responses fail closed", async () => {
  for (const properties of [
    { status: 302, headers: { location: "http://169.254.169.254" } },
    { headers: { "content-encoding": "gzip" } },
    { headers: { "content-type": "text/html" } },
    { headers: { "content-length": "1048577" } },
    { chunks: [Buffer.alloc(1048577)] },
    { aborted: true },
  ]) {
    const fixture = httpFixture(properties);
    await assert.rejects(postSourcePage(source.endpoint, "{}", {}, fixture), /source_unavailable/);
    if (!properties.aborted) assert.equal(fixture.destroyed, true);
  }
});

test("signed local APIs respect source freshness and refuse competing writes", async t => {
  const { directory, store, sync } = fixture(t);
  const options = { enabled: true, environment: "staging", directory };
  const query = { kind: "cart", reference: store.reference("cart", "private-cart-id"), minimumRevision: 1 };
  const signed = (role, input) => {
    const path = role === "read" ? "/api/local-data/v1/read" : "/api/local-data/v1/records";
    const timestamp = String(Date.now()), nonce = randomBytes(16).toString("hex"), body = JSON.stringify(input);
    const secret = role === "read" ? store.config.readKey : store.config.ingestionKey;
    return new Request("https://community.example.invalid" + path, { method: "POST", body, headers: {
      "Content-Type": "application/json", "X-NC-Data-Time": timestamp, "X-NC-Data-Nonce": nonce,
      "X-NC-Data-Signature": signLocalRequest(secret, "POST", path, timestamp, nonce, body),
    } });
  };
  assert.equal((await handleLocalData(signed("read", query), "read", options)).status, 503);
  sync.apply(page(), sync.claim());
  assert.equal((await handleLocalData(signed("read", query), "read", options)).status, 200);
  assert.equal((await handleLocalData(signed("write", record()), "write", options)).status, 409);
  sync.failed(sync.claim());
  assert.equal((await handleLocalData(signed("read", query), "read", options)).status, 503);
});

test("repeated records deduplicate across batches and source deletions propagate", t => {
  const { store, sync } = fixture(t);
  const input = record();
  sync.apply(page({ records: [input] }), sync.claim());
  sync.apply(page({ cursor: cursor1, nextCursor: cursor2, records: [input] }), sync.claim());
  assert.equal(store.signals().length, 1);
  sync.apply(page({ cursor: cursor2, nextCursor: "d".repeat(64), records: [{ ...input, revision: 2, operation: "delete", payload: {} }] }), sync.claim());
  assert.throws(() => store.read({ kind: "cart", reference: store.reference("cart", input.sourceId), minimumRevision: 1 }), /record_deleted/);
  assert.equal(store.signals().length, 2);
});
