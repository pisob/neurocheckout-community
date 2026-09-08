// Opt-in integration test. Uses the historical signed public .3 release,
// synthetic configuration and an isolated port; never connects a Cloud account.
import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

const checkout = process.cwd();
const root = await mkdtemp(join(tmpdir(), "nc-launcher-test-"));
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const config = 'NC_COMMUNITY_SESSION_SECRET=synthetic-update-test-secret-more-than-32-characters\nNC_COMMUNITY_CLIENT_ID=nc_public_test_fixture\nNC_COMMUNITY_COOKIE_SECURE=false\n';
let child;
let output = "";
function start() {
  const instance = spawn(process.execPath, [resolve(checkout, "scripts/start-standalone.mjs")], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), HOSTNAME: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  instance.stdout.on("data", data => { output += data; });
  instance.stderr.on("data", data => { output += data; });
  return instance;
}
async function wait(check, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(output);
    try { if (await check()) return; } catch { /* Wait for readiness. */ }
    await delay(500);
  }
  throw new Error("Timed out: " + output);
}
async function stop() {
  if (child.exitCode !== null) return;
  const exit = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exit;
}
try {
  await symlink(resolve(checkout, ".next"), join(root, ".next"), "dir");
  await symlink(resolve(checkout, "public"), join(root, "public"), "dir");
  await writeFile(join(root, ".env.local"), config, { mode: 0o600 });
  child = start();
  const healthy = async () => (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  await wait(healthy);
  const directory = join(root, ".community-updates");
  await writeFile(join(directory, "request.json"), JSON.stringify({ version: "0.1.0-preview.3" }));
  await wait(async () => {
    const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
    if (status.phase === "failed") throw new Error("Preparation failed");
    return status.phase === "complete";
  }, 600000);
  const pointer = JSON.parse(await readFile(join(directory, "current.json"), "utf8"));
  const source = resolve(directory, pointer.path);
  assert.equal(JSON.parse(await readFile(join(source, "package.json"), "utf8")).version, "0.1.0-preview.3");
  assert.equal(await readFile(join(root, ".env.local"), "utf8"), config);
  await assert.rejects(access(join(source, ".env.local")));
  assert.equal(await healthy(), true);
  await stop();
  child = start();
  await wait(healthy);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "current.json"), "utf8")), pointer);
  await writeFile(join(directory, "request.json"), JSON.stringify({ version: "../invalid" }));
  await wait(async () => JSON.parse(await readFile(join(directory, "status.json"), "utf8")).phase === "failed");
  assert.equal(await healthy(), true);
  assert.equal(await readFile(join(root, ".env.local"), "utf8"), config);
  console.log("Real signed-release preparation, live switch, restart persistence and failed-request continuity passed.");
} finally {
  if (child) await stop();
  await rm(root, { recursive: true, force: true });
}
