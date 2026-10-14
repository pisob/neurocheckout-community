import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { heartbeatOnce, saveAvailabilityCredential } from "./server-availability.mjs";

test("server heartbeat survives restart, pauses on health failure, and recovers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nc-availability-test-"));
  const token = "nc_live_" + randomBytes(32).toString("base64url");
  const options = { directory, secret: randomBytes(32).toString("hex"), cloudUrl: "https://cloud.example", clientId: "test", port: "3400", version: "test-version" };
  const calls = [];
  let healthy = true;
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" }, { status: healthy ? 200 : 503 });
    return Response.json({ ok: true });
  };
  try {
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(calls.length, 0);
    await saveAvailabilityCredential({ ...options, token });
    const file = join(directory, "availability.enc");
    assert.equal((await readFile(file)).includes(Buffer.from(token)), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(await heartbeatOnce({ ...options }, fetchImpl), true);
    assert.equal(calls.at(-1)[1].headers.Authorization, `Bearer ${token}`);
    assert.equal(calls.at(-1)[1].redirect, "error");
    healthy = false;
    calls.length = 0;
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(calls.length, 1); // no Cloud heartbeat when local service is down
    healthy = true;
    assert.equal(await heartbeatOnce(options, fetchImpl), true);
    calls.length = 0;
    assert.equal(await heartbeatOnce({ ...options, clientId: "different" }, fetchImpl), false);
    assert.equal(await heartbeatOnce({ ...options, cloudUrl: "https://other.example" }, fetchImpl), false);
    assert.equal(await heartbeatOnce({ ...options, secret: "another-secret-that-is-at-least-32-characters" }, fetchImpl), false);
    assert.equal(calls.length, 0);
    assert.equal(await heartbeatOnce(options, async () => { throw new Error("timeout"); }), false);
    await chmod(directory, 0o755);
    await assert.rejects(saveAvailabilityCredential({ ...options, token }), /private/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejected credentials back off, recover, and remain isolated per installation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nc-availability-backoff-"));
  const otherDirectory = await mkdtemp(join(tmpdir(), "nc-availability-other-"));
  const options = { directory, secret: randomBytes(32).toString("hex"), cloudUrl: "https://cloud.example", clientId: "test", port: "3400", version: "preview-test" };
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  let status = 401, posts = 0;
  const fetchImpl = async url => {
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
    posts++;
    return Response.json({ ok: status === 200 }, { status });
  };
  const credential = () => "nc_live_" + randomBytes(32).toString("base64url");
  try {
    await saveAvailabilityCredential({ ...options, token: credential() });
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    for (let i = 0; i < 50; i++) assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(posts, 1);
    now += 30000;
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(posts, 2);
    now += 30000; // second failure requires 60 seconds, not another 30-second loop
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(posts, 2);
    const other = { ...options, directory: otherDirectory };
    await saveAvailabilityCredential({ ...other, token: credential() });
    status = 200;
    assert.equal(await heartbeatOnce(other, fetchImpl), true);
    assert.equal(posts, 3);
    // Renewed credential resumes immediately, even inside the old cooldown.
    await saveAvailabilityCredential({ ...options, token: credential() });
    assert.equal(await heartbeatOnce(options, fetchImpl), true);
    assert.equal(await heartbeatOnce(options, fetchImpl), true);
    assert.equal(posts, 5); // no cached positive authorization
    status = 401;
    const start = now;
    const initialPosts = posts;
    for (let seconds = 0; seconds < 3600; seconds += 30) {
      now = start + seconds * 1000;
      assert.equal(await heartbeatOnce(options, fetchImpl), false);
    }
    assert.ok(posts - initialPosts <= 10, "repeated 401s must not generate 120 attempts per hour");
    now += 900000;
    status = 200;
    assert.equal(await heartbeatOnce(options, fetchImpl), true);
    status = 401;
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    now += 30000;
    status = 200;
    assert.equal(await heartbeatOnce(options, fetchImpl), true, "success resets the delay");
  } finally {
    Date.now = realNow;
    await rm(directory, { recursive: true, force: true });
    await rm(otherDirectory, { recursive: true, force: true });
  }
});

test("simultaneous callers cannot unlock another heartbeat in progress", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nc-availability-concurrent-"));
  const options = { directory, secret: randomBytes(32).toString("hex"), cloudUrl: "https://cloud.example", clientId: "test", port: "3400", version: "preview-test" };
  let release, reached;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { reached = resolve; });
  let posts = 0;
  const fetchImpl = async url => {
    if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
    posts++;
    reached();
    await held;
    return Response.json({ ok: true });
  };
  try {
    await saveAvailabilityCredential({ ...options, token: "nc_live_" + randomBytes(32).toString("base64url") });
    const first = heartbeatOnce(options, fetchImpl);
    await started;
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(await heartbeatOnce(options, fetchImpl), false);
    assert.equal(posts, 1);
    release();
    assert.equal(await first, true);
    assert.equal(await heartbeatOnce(options, fetchImpl), true);
    assert.equal(posts, 2);
  } finally {
    release();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const failure of [403, 426, 429, 503, "timeout"]) {
  test(`heartbeat pauses safely after ${failure} and retries after a bounded delay`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "nc-availability-failure-"));
    const options = { directory, secret: randomBytes(32).toString("hex"), cloudUrl: "https://cloud.example", clientId: "test", port: "3400", version: "preview-test" };
    const realNow = Date.now;
    let now = realNow(), posts = 0;
    Date.now = () => now;
    try {
      await saveAvailabilityCredential({ ...options, token: "nc_live_" + randomBytes(32).toString("base64url") });
      const fetchImpl = async url => {
        if (url.endsWith("/api/health")) return Response.json({ service: "neurocheckout-community" });
        posts++;
        if (failure === "timeout") throw new Error("network error");
        return Response.json({}, { status: failure });
      };
      assert.equal(await heartbeatOnce(options, fetchImpl), false);
      assert.equal(await heartbeatOnce(options, fetchImpl), false);
      assert.equal(posts, 1);
      now += 900000;
      assert.equal(await heartbeatOnce(options, fetchImpl), false);
      assert.equal(posts, 2);
    } finally {
      Date.now = realNow;
      await rm(directory, { recursive: true, force: true });
    }
  });
}
