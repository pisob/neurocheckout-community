import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const FINGERPRINT = "2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0";
const RELEASE_BASE = "https://github.com/pisob/neurocheckout-community";
const RETRYABLE_ASSET_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TERMINAL_ASSET_ERRORS = new Set(["asset_missing", "asset_rejected", "asset_too_large"]);
export function validVersion(version) {
  return typeof version === "string" && version.length < 128 && version === version.trim() && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version);
}
export function compareVersions(left, right) {
  if (!validVersion(left) || !validVersion(right)) return null;
  const parse = value => {
    const separator = value.indexOf("-");
    const core = (separator === -1 ? value : value.slice(0, separator)).split(".").map(Number);
    const prerelease = separator === -1 ? null : value.slice(separator + 1).split(".");
    return { core, prerelease };
  };
  const a = parse(left), b = parse(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  }
  if (a.prerelease === null || b.prerelease === null) {
    if (a.prerelease === b.prerelease) return 0;
    return a.prerelease === null ? 1 : -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index++) {
    const leftPart = a.prerelease[index], rightPart = b.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^[0-9]+$/.test(leftPart), rightNumeric = /^[0-9]+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) === 1;
}
export function verifySigner(status) {
  const lines = status.split("\n").filter(line => line.startsWith("[GNUPG:] VALIDSIG "));
  if (lines.length !== 1 || !lines[0].split(/\s+/).includes(FINGERPRINT) ||
      /\[GNUPG:\] (?:BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG)/.test(status)) throw new Error("signature_rejected");
}
export function verifyCheckout(head, tagCommit) {
  if (!/^[a-f0-9]{40,64}$/.test(head.trim()) || head.trim() !== tagCommit.trim()) throw new Error("checkout_tag_mismatch");
}
export function releaseAssetUrl(version, name, suffix = "") {
  if (!validVersion(version) || name !== `neurocheckout-community-${version}.tar.gz` || !["", ".sha256", ".asc"].includes(suffix)) {
    throw new Error("invalid_release_asset");
  }
  return `${RELEASE_BASE}/releases/download/v${version}/${name}${suffix}`;
}
export async function fetchReleaseAsset(url, {
  signal = new AbortController().signal,
  fetchImpl = fetch,
  retryDelays = [1000, 3000],
  timeoutMs = 180000,
  maximumBytes = 32 * 1024 * 1024,
} = {}) {
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error("asset_missing");
        if (!RETRYABLE_ASSET_STATUSES.has(response.status)) throw new Error("asset_rejected");
        throw new Error("asset_temporarily_unavailable");
      }
      if (!response.body) throw new Error("asset_temporarily_unavailable");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximumBytes) throw new Error("asset_too_large");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (signal.aborted) throw error;
      if (TERMINAL_ASSET_ERRORS.has(error?.message)) throw error;
      if (attempt === retryDelays.length) throw new Error("asset_unavailable");
      await delay(retryDelays[attempt], undefined, { signal });
    }
  }
  throw new Error("asset_unavailable");
}
export async function prepareRelease(directory, version, phase, signal = new AbortController().signal) {
  if (!validVersion(version)) throw new Error("invalid_version");
  const root = await mkdtemp(join(directory, "release-"));
  const keyring = join(root, "keyring");
  const npmCache = join(directory, "npm-cache");
  await mkdir(keyring, { mode: 0o700 });
  await mkdir(npmCache, { recursive: true, mode: 0o700 });
  await chmod(npmCache, 0o700);
  // Do not pass application secrets to dependency/build processes.
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GNUPGHOME: keyring,
    NEXT_TELEMETRY_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0",
    npm_config_cache: npmCache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_fetch_retries: "5",
    npm_config_fetch_retry_maxtimeout: "120000",
    npm_config_fetch_timeout: "300000",
  };
  const run = (file, args, cwd = root, timeoutMs = 600000) => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(file, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", aborted = false;
    const kill = () => { aborted = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } };
    const timer = setTimeout(kill, timeoutMs);
    signal.addEventListener("abort", kill, { once: true });
    const collect = (kind, chunk) => {
      if (kind === "stdout") stdout += chunk; else stderr += chunk;
      if (stdout.length + stderr.length > 8 * 1024 * 1024) kill();
    };
    child.stdout.on("data", chunk => collect("stdout", chunk));
    child.stderr.on("data", chunk => collect("stderr", chunk));
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", kill); };
    child.on("error", error => { cleanup(); reject(error); });
    child.on("close", code => { cleanup(); if (code !== 0 || aborted) reject(new Error("update_command_failed")); else resolve({ stdout, stderr }); });
  });
  try {
    await phase("verifying");
    await run("git", ["clone", "--depth", "1", "--branch", `v${version}`, `${RELEASE_BASE}.git`, "source"]);
    const source = join(root, "source");
    await run("gpg", ["--batch", "--import", join(source, "RELEASE-PUBLIC-KEY.asc")]);
    const tag = await run("git", ["verify-tag", "--raw", `v${version}`], source);
    verifySigner(tag.stderr);
    verifyCheckout((await run("git", ["rev-parse", "HEAD"], source)).stdout,
      (await run("git", ["rev-parse", `refs/tags/v${version}^{commit}`], source)).stdout);
    await run("git", ["diff", "--exit-code", "HEAD"], source);
    const metadata = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    if (metadata.version !== version) throw new Error("version_mismatch");
    // Verify all release assets and their equality with the signed Git tree.
    const name = `neurocheckout-community-${version}.tar.gz`;
    await phase("downloading");
    for (const suffix of ["", ".sha256", ".asc"]) {
      const url = releaseAssetUrl(version, name, suffix);
      await writeFile(join(root, name + suffix), await fetchReleaseAsset(url, { signal }));
    }
    const checksum = (await readFile(join(root, name + ".sha256"), "utf8")).trim();
    if (!new RegExp(`^[a-f0-9]{64}  ${name.replaceAll(".", "\\.")}$`).test(checksum)) throw new Error("checksum_invalid");
    await run("sha256sum", ["--check", name + ".sha256"]);
    const signature = await run("gpg", ["--batch", "--status-fd", "1", "--verify", name + ".asc", name]);
    verifySigner(signature.stdout);
    await run("git", ["archive", "--format=tar", `--prefix=neurocheckout-community-${version}/`, "--output=" + join(root, "tree.tar"), `v${version}`], source);
    await run("gzip", ["-n", "-9", "tree.tar"]);
    const published = await readFile(join(root, name));
    if (!published.equals(await readFile(join(root, "tree.tar.gz")))) throw new Error("archive_tree_mismatch");
    await phase("building");
    await run("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], source, 30 * 60_000);
    await run("npm", ["run", "build"], source, 15 * 60_000);
    await rm(keyring, { recursive: true, force: true });
    return source;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
