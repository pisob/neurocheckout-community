import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { readFile, writeFile, rename, unlink, open, rm, readdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadEnvironmentFile } from "./env-file.mjs";
import { prepareRelease } from "./verified-update.mjs";
import { activateCandidate } from "./update-switch.mjs";

const root = process.cwd();
loadEnvironmentFile(resolve(root, ".env.local"));
process.env.HOSTNAME ||= "127.0.0.1";
process.env.PORT ||= "3400";
process.env.NC_COMMUNITY_STATE_DIRECTORY ||= resolve(root, ".community-state");
const directory = resolve(root, ".community-updates");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const lockPath = resolve(directory, "launcher.lock");
try {
  const oldPid = Number(await readFile(lockPath, "utf8"));
  if (Number.isInteger(oldPid) && oldPid > 0) {
    try { process.kill(oldPid, 0); throw new Error("Another Community launcher is running."); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  await unlink(lockPath);
} catch (error) { if (error.code !== "ENOENT") throw error; }
const lock = await open(lockPath, "wx", 0o600);
await lock.writeFile(String(process.pid));
await lock.close();
let stopping = false;
const cancellation = new AbortController();
let switching = false;
let child;
const pointer = resolve(directory, "current.json");
const requestPath = resolve(directory, "request.json");
async function status(phase) {
  await writeFile(resolve(directory, "status.tmp"), JSON.stringify({ phase }), { mode: 0o600 });
  await rename(resolve(directory, "status.tmp"), resolve(directory, "status.json"));
}
function launch(source) {
  const server = resolve(source, ".next/standalone/server.js");
  if (!existsSync(server)) throw new Error("Standalone build missing. Run npm run build first.");
  for (const [link, target] of [[resolve(source, ".next/standalone/.next/static"), "../../static"], [resolve(source, ".next/standalone/public"), "../../public"]]) {
    if (!existsSync(link)) { mkdirSync(dirname(link), { recursive: true }); symlinkSync(target, link, "dir"); }
  }
  const instance = spawn(process.execPath, [server], { cwd: source, stdio: "inherit", env: { ...process.env, NC_LOCAL_UPDATE_DIRECTORY: process.platform === "linux" ? directory : "" } });
  instance.on("exit", code => {
    if (!switching && !stopping) { stopping = true; process.exitCode = code || 1; }
  });
  instance.on("error", () => { if (!switching) stopping = true; });
  return instance;
}
async function stop(instance) {
  if (!instance || instance.exitCode !== null || instance.signalCode !== null) return;
  instance.kill("SIGTERM");
  for (let i = 0; i < 100 && instance.exitCode === null && instance.signalCode === null; i++) await delay(100);
  if (instance.exitCode === null && instance.signalCode === null) {
    instance.kill("SIGKILL");
    await new Promise(resolve => instance.once("exit", resolve));
  }
}
async function healthy(instance) {
  for (let i = 0; i < 40; i++) {
    if (stopping || instance.exitCode !== null || instance.signalCode !== null) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).service === "neurocheckout-community") return true;
    } catch { /* Startup may take a moment. */ }
    await delay(500);
  }
  return false;
}
let current = root;
let previous = root;
try {
  const saved = JSON.parse(await readFile(pointer, "utf8"));
  const resolved = resolve(directory, saved.path);
  const within = relative(directory, resolved);
  if (!within.startsWith("..") && !isAbsolute(within) && existsSync(resolve(resolved, ".next/standalone/server.js"))) {
    current = resolved;
    if (typeof saved.previous === "string") previous = resolve(directory, saved.previous);
  }
} catch { /* First start uses the installed build. */ }
// An interrupted request is not silently retried at startup.
try { await unlink(requestPath); await status("interrupted"); } catch (error) { if (error.code !== "ENOENT") throw error; }
await rm(resolve(directory, "queue.lock"), { recursive: true, force: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; cancellation.abort(); });
try {
  child = launch(current);
  while (!stopping) {
    await delay(500);
    let request;
    try { request = JSON.parse(await readFile(requestPath, "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; await unlink(requestPath).catch(() => {}); await status("failed"); continue; }
    try {
      // Retain the current and immediately previous build; discard only our
      // generated staging directories before allocating another candidate.
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && /^release-[A-Za-z0-9]+$/.test(entry.name)) {
          const generated = resolve(directory, entry.name);
          if (dirname(current) !== generated && dirname(previous) !== generated) await rm(generated, { recursive: true, force: true });
        }
      }
      const candidate = await prepareRelease(directory, request.version, status, cancellation.signal);
      if (stopping) break;
      await status("restarting");
      switching = true;
      const result = await activateCandidate(candidate, current, {
        stop: () => stop(child),
        start: source => { child = launch(source); },
        healthy: () => healthy(child),
        commit: async source => {
          await writeFile(pointer + ".tmp", JSON.stringify({ path: relative(directory, source), previous: relative(directory, current) }), { mode: 0o600 });
          await rename(pointer + ".tmp", pointer);
        },
      });
      if (result.phase === "complete") previous = current;
      current = result.current;
      await status(result.phase);
    } catch {
      if (switching && !stopping) {
        await stop(child);
        child = launch(current);
        await status((await healthy(child)) ? "rolled_back" : "failed");
      } else await status("failed");
    } finally {
      switching = false;
      await unlink(requestPath).catch(() => {});
      await rm(resolve(directory, "queue.lock"), { recursive: true, force: true });
    }
  }
} finally {
  await stop(child);
  await unlink(lockPath).catch(() => {});
}
