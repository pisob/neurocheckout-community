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
