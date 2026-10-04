import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { readFile, writeFile, rename, unlink, open, rm, readdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadEnvironmentFile } from "./env-file.mjs";
import { isNewerVersion, prepareRelease, validVersion } from "./verified-update.mjs";
import { activateCandidate } from "./update-switch.mjs";
import { createUpdateBackup, updatePreflight } from "./update-backup.mjs";

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
async function status(phase, version, errorCode) {
  const payload = validVersion(version) ? { phase, version } : { phase };
  if (['update_disk_space_low','update_private_directory_required','asset_unavailable','asset_missing','signature_rejected'].includes(errorCode)) payload.error_code = errorCode;
  await writeFile(resolve(directory, "status.tmp"), JSON.stringify(payload), { mode: 0o600 });
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
function safeBuildPath(value) {
  if (typeof value !== "string") return null;
  const path = resolve(directory, value), within = relative(directory, path);
  return (path === root || (!within.startsWith("..") && !isAbsolute(within))) && existsSync(resolve(path, ".next/standalone/server.js")) ? path : null;
}
try {
  const saved = JSON.parse(await readFile(pointer, "utf8"));
  const resolved = safeBuildPath(saved.path);
  if (resolved) {
    current = resolved;
    previous = safeBuildPath(saved.previous) || root;
  }
} catch { /* First start uses the installed build. */ }
// An interrupted request is not silently retried at startup.
try {
  const interrupted = JSON.parse(await readFile(requestPath, "utf8"));
  await unlink(requestPath);
  await status("interrupted", interrupted?.version);
} catch (error) { if (error.code !== "ENOENT") throw error; }
await rm(resolve(directory, "queue.lock"), { recursive: true, force: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; cancellation.abort(); });
try {
  switching = true;
  child = launch(current);
  if (!(await healthy(child))) {
    await stop(child);
    if (previous === current || stopping) throw new Error("startup_unhealthy");
    child = launch(previous);
    if (!(await healthy(child))) throw new Error("rollback_unhealthy");
    current = previous;
    await writeFile(pointer + ".tmp", JSON.stringify({path:relative(directory,current)}),{mode:0o600});
    await rename(pointer + ".tmp",pointer);
    await status("rolled_back");
  }
  switching = false;
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
      const currentMetadata = JSON.parse(await readFile(resolve(current, "package.json"), "utf8"));
      if (!isNewerVersion(request.version, currentMetadata.version)) throw new Error("update_not_newer");
      await status("preflight", request.version);
      updatePreflight(directory);
      const candidate = await prepareRelease(directory, request.version, phase => status(phase, request.version), cancellation.signal);
      if (stopping) break;
      await status("restarting", request.version);
      switching = true;
      const result = await activateCandidate(candidate, current, {
        stop: () => stop(child),
        backup: async () => {
          await status("backing_up", request.version);
          const destination = resolve(directory, `backup-${Date.now()}`);
          createUpdateBackup({ root, stateDirectory: process.env.NC_COMMUNITY_STATE_DIRECTORY, destination });
          await status("restarting", request.version);
        },
        start: source => { child = launch(source); },
        healthy: () => healthy(child),
        commit: async source => {
          await writeFile(pointer + ".tmp", JSON.stringify({ path: relative(directory, source), previous: relative(directory, current) }), { mode: 0o600 });
          await rename(pointer + ".tmp", pointer);
        },
      });
      if (result.phase === "complete") previous = current;
      current = result.current;
      await status(result.phase, request.version);
    } catch (error) {
      if (switching && !stopping) {
        await stop(child);
        child = launch(current);
        await status((await healthy(child)) ? "rolled_back" : "failed", request?.version);
      } else await status("failed", request?.version, error?.message);
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
