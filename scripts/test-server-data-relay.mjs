import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, readFileSync, chmodSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { saveRelayCredential, relayOnce } from "./server-data-relay.mjs";
import { LocalDataStore } from "./local-data-store.mjs";
import { EmailArchive } from "./email-archive.mjs";
import { SourceSynchronizer } from "./local-source-sync.mjs";

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), "nc-outgoing-relay-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, enabled: true, environment: "staging", secret: "synthetic-session-secret-with-at-least-32-characters",
    cloudUrl: "http://127.0.0.1:43120", clientId: "synthetic-client", port: "43119", version: "synthetic-version" };
}
const credential = () => ({ token: "nc_data_" + randomBytes(32).toString("base64url"),
  installation_id: "11111111-1111-4111-8111-111111111111", shop_id: "synthetic-shop" });

test("online relay reports a stale connector separately and resumes without leaking data", async t => {
  const options = fixture(t), auth = credential();
  await saveRelayCredential(options, auth);
  const store = new LocalDataStore(options.directory);
  new SourceSynchronizer(store).configure({
    endpoint: "https://shop.example.com/module/neurocheckoutconnector/communitydata",
    secret: "b".repeat(64),
  });
  const record = store.transaction(() => store.putInTransaction({ kind: "product", sourceId: "synthetic", revision: 1,
    operation: "upsert", observedAt: new Date().toISOString(), payload: { name: "Local product" } }));
  store.acknowledgeSignals(store.signals().map(signal => signal.id));
  const command = { request_id: "a".repeat(32), operation: "read",
    record: { kind: "product", reference: record.reference, minimumRevision: 1 } };
  const replies = [];
  const mock = async url => {
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
    if (url.endsWith("/poll")) return Response.json({ commands: [command] });
    return Response.json({ accepted: true });
  };
  const capture = async (url, init) => {
    if (url.endsWith("/reply")) replies.push(JSON.parse(init.body).result);
    return mock(url);
  };
  try {
    assert.equal(await relayOnce(options, capture), true);
    assert.deepEqual(replies[0], { status: "source_unavailable" });
    store.db.prepare("UPDATE source_sync SET ready=1,last_complete_at=? WHERE id=1").run(Date.now());
    assert.equal(await relayOnce(options, capture), true);
    assert.equal(replies[1].status, "ok");
    assert.equal(replies[1].record.payload.name, "Local product");
  } finally { store.close(); }
});

test("authenticated relay archives large copies and confirms only metadata", async t => {
  const options=fixture(t), auth=credential();await saveRelayCredential(options,auth);
  let operation="archive_email";
  const copy={delivery_id:"community-edge-1",recipient_email:"private@example.invalid",subject:"Original",body_html:"<p>"+"x".repeat(5000)+"</p>",body_text:"Original",agent_name:"abandoned_cart",copy_signature:"a".repeat(64)};
  const mock=async (url,init)=>{
    if(url.endsWith("/api/health"))return Response.json({service:"neurocheckout-community"});
    assert.equal(init.headers.Authorization,`Bearer ${auth.token}`);
    if(url.endsWith("/poll"))return Response.json({commands:[{operation,request_id:"b".repeat(32),record:operation==="archive_email"?copy:{delivery_id:copy.delivery_id,sent_at:new Date().toISOString()}}]});
    const reply=JSON.parse(init.body);assert.equal(reply.result.status,"ok");assert.equal(reply.result.archived,true);
    if(operation==="archive_email")assert.deepEqual(reply.result.copy,copy);
    return Response.json({accepted:true});
  };
  assert.equal(await relayOnce(options,mock),true);operation="confirm_email";
  assert.equal(await relayOnce(options,mock),true);
  const archive=new EmailArchive(options.directory);assert.deepEqual(archive.get(copy.delivery_id),copy);
  assert.ok(archive.db.prepare('SELECT sent_at FROM email_archive').get().sent_at);archive.close();
});

test("outgoing polling reads locally, replies only to Cloud and survives restart", async t => {
  const options = fixture(t), auth = credential();
  await saveRelayCredential(options, auth);
  assert.equal(readFileSync(resolve(options.directory, "data-relay.enc")).includes(Buffer.from(auth.token)), false);
  const store = new LocalDataStore(options.directory);
  const record = store.put({ kind: "cart", sourceId: "synthetic", revision: 1, operation: "upsert", observedAt: new Date().toISOString(), payload: { email: "synthetic-private@example.invalid", status: "abandoned" } });
  store.close();
  const command = { request_id: "a".repeat(32), operation: "read", record: { kind: "cart", reference: record.reference, minimumRevision: 1 } };
  let replies = 0;
  let signalBatches = 0;
  const mock = async (url, init) => {
    assert.equal(init.redirect, "error");
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
    assert.equal(init.headers.Authorization, `Bearer ${auth.token}`);
    assert.ok(url.startsWith(options.cloudUrl));
    if (url.endsWith("/signals")) {
      const signalBody = JSON.parse(init.body);
      assert.equal(JSON.stringify(signalBody).includes("synthetic-private@example.invalid"), false);
      assert.deepEqual(Object.keys(signalBody), ["signals"]);
      signalBatches++;
      return Response.json({ accepted_ids: signalBody.signals.map(signal => signal.id) });
    }
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
  assert.equal(signalBatches, 1);
  const acknowledged = new LocalDataStore(options.directory);
  assert.equal(acknowledged.signals().length, 0);
  acknowledged.close();
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
