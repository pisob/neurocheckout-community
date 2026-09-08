import { spawn } from "node:child_process";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const FINGERPRINT = "2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0";
export function validVersion(version) {
  return typeof version === "string" && version.length < 128 && version === version.trim() && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version);
}
export function verifySigner(status) {
  const lines = status.split("\n").filter(line => line.startsWith("[GNUPG:] VALIDSIG "));
  if (lines.length !== 1 || !lines[0].split(/\s+/).includes(FINGERPRINT) ||
      /\[GNUPG:\] (?:BADSIG|ERRSIG|REVKEYSIG|EXPKEYSIG|EXPSIG)/.test(status)) throw new Error("signature_rejected");
}
export function verifyCheckout(head, tagCommit) {
  if (!/^[a-f0-9]{40,64}$/.test(head.trim()) || head.trim() !== tagCommit.trim()) throw new Error("checkout_tag_mismatch");
}
export async function prepareRelease(directory, version, phase, signal = new AbortController().signal) {
  if (!validVersion(version)) throw new Error("invalid_version");
  const root = await mkdtemp(join(directory, "release-"));
  const keyring = join(root, "keyring");
  await mkdir(keyring, { mode: 0o700 });
  // Do not pass application secrets to dependency/build processes.
  const env = { PATH: process.env.PATH, HOME: root, GNUPGHOME: keyring, NEXT_TELEMETRY_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
  const run = (file, args, cwd = root) => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(file, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", aborted = false;
    const kill = () => { aborted = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } };
    const timer = setTimeout(kill, 600000);
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
    const base = "https://github.com/pisob/neurocheckout-community";
    const response = await fetch(`https://api.github.com/repos/pisob/neurocheckout-community/releases/tags/v${version}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) throw new Error("release_unpublished");
    const release = await response.json();
    if (release.draft || release.tag_name !== `v${version}`) throw new Error("release_rejected");
    await run("git", ["clone", "--depth", "1", "--branch", `v${version}`, `${base}.git`, "source"]);
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
    for (const suffix of ["", ".sha256", ".asc"]) {
      const asset = await fetch(`${base}/releases/download/v${version}/${name}${suffix}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
      if (!asset.ok) throw new Error("asset_missing");
      const chunks = []; let size = 0;
      for await (const chunk of asset.body) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error("asset_too_large");
        chunks.push(chunk);
      }
      await writeFile(join(root, name + suffix), Buffer.concat(chunks));
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
    await run("npm", ["ci"], source);
    await run("npm", ["run", "build"], source);
    await rm(keyring, { recursive: true, force: true });
    return source;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
