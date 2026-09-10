import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, readFileSync, chmodSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { saveRelayCredential, relayOnce } from "./server-data-relay.mjs";
import { LocalDataStore } from "./local-data-store.mjs";

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-outgoing-relay-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, enabled: true, environment: "staging", secret: "synthetic-session-secret-with-at-least-32-characters",
    cloudUrl: "https://cloud.example.invalid", clientId: "synthetic-client", port: "43119", version: "synthetic-version" };
}
const credential = () => ({ token: "nc_data_" + randomBytes(32).toString("base64url"),
  installation_id: "11111111-1111-4111-8111-111111111111", shop_id: "synthetic-shop" });

test("outgoing polling reads locally, replies only to Cloud and survives restart", async t => {
  const options = fixture(t), auth = credential();
  await saveRelayCredential(options, auth);
  assert.equal(readFileSync(resolve(options.directory, "data-relay.enc")).includes(Buffer.from(auth.token)), false);
  const store = new LocalDataStore(options.directory);
  const record = store.put({ kind: "cart", sourceId: "synthetic", revision: 1, operation: "upsert", observedAt: new Date().toISOString(), payload: { email: "synthetic-private@example.invalid", status: "abandoned" } });
  store.close();
  const command = { request_id: "a".repeat(32), operation: "read", record: { kind: "cart", reference: record.reference, minimumRevision: 1 } };
  let replies = 0;
  const mock = async (url, init) => {
    assert.equal(init.redirect, "error");
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
    assert.equal(init.headers.Authorization, `Bearer ${auth.token}`);
    assert.ok(url.startsWith(options.cloudUrl));
    if (url.endsWith("/poll")) { assert.equal(init.body, "{}"); return Response.json({ commands: [command] }); }
    assert.equal(url, `${options.cloudUrl}/api/v1/public/community-relay/reply`);
    const reply = JSON.parse(init.body);
    assert.equal(reply.request_id, command.request_id);
    assert.equal(reply.result.record.payload.status, "abandoned");
    replies++;
    return Response.json({ accepted: true });
  };
  assert.equal(await relayOnce(options, mock), true);
  assert.equal(await relayOnce({ ...options }, mock), true);
  assert.equal(replies, 2);
  assert.equal(await relayOnce(options, async () => { throw new Error("network offline"); }), false);
  assert.equal(await relayOnce(options, mock), true);
});

test("no callback URLs, writes or account substitution are accepted", async t => {
  const options = fixture(t), auth = credential(); await saveRelayCredential(options, auth);
  const before = readFileSync(resolve(options.directory, "data-relay.enc"));
  await assert.rejects(saveRelayCredential(options, { ...auth, installation_id: "22222222-2222-4222-8222-222222222222" }), /installation_mismatch/);
  assert.deepEqual(readFileSync(resolve(options.directory, "data-relay.enc")), before);
  for (const command of [
    { request_id: "a".repeat(32), operation: "write", record: {} },
    { request_id: "a".repeat(32), operation: "read", record: {}, url: "http://169.254.169.254" },
  ]) {
    assert.equal(await relayOnce(options, async url => url.endsWith("/api/health") ? Response.json({ service: "neurocheckout-community" }) : Response.json({ commands: [command] })), false);
  }
  for (const invalid of [{ enabled: false }, { environment: "production" }, { cloudUrl: "http://unsafe.example.invalid" }, { clientId: "another-client" }]) {
    assert.equal(await relayOnce({ ...options, ...invalid }, () => { assert.fail("no network expected"); }), false);
  }
});

test("relay credentials refuse permissive files, directories and symbolic links before network", async t => {
  const options = fixture(t); await saveRelayCredential(options, credential());
  const file = resolve(options.directory, "data-relay.enc");
  const noNetwork = () => assert.fail("no network before private credential validation");
  chmodSync(file, 0o644);
  assert.equal(await relayOnce(options, noNetwork), false);
  chmodSync(file, 0o600);
  chmodSync(options.directory, 0o755);
  assert.equal(await relayOnce(options, noNetwork), false);
  chmodSync(options.directory, 0o700);
  renameSync(file, file + ".original");
  symlinkSync(file + ".original", file);
  assert.equal(await relayOnce(options, noNetwork), false);
});
