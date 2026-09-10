import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rename, unlink, lstat } from "node:fs/promises";
import { resolve } from "node:path";

function key(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("availability_secret_required");
  return createHash("sha256").update("community-availability-v1\0" + secret).digest();
}

export async function saveAvailabilityCredential(options) {
  if (!/^nc_live_[A-Za-z0-9_-]{43}$/.test(options.token)) throw new Error("availability_token_invalid");
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077)) throw new Error("availability_directory_must_be_private");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(options.secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ token: options.token, cloudUrl: options.cloudUrl, clientId: options.clientId })), cipher.final()]);
  const content = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  const temporary = resolve(directory, `availability-${randomBytes(12).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, resolve(directory, "availability.enc"));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function heartbeatOnce(options, fetchImpl = fetch) {
  // A successful browser request is never used as a heartbeat.
  try {
    const content = await readFile(resolve(options.directory, "availability.enc"));
    const decipher = createDecipheriv("aes-256-gcm", key(options.secret), content.subarray(0, 12));
    decipher.setAuthTag(content.subarray(12, 28));
    const credential = JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString("utf8"));
    if (credential.cloudUrl !== options.cloudUrl || credential.clientId !== options.clientId) return false;
    if (!/^nc_live_[A-Za-z0-9_-]{43}$/.test(credential.token)) return false;
    const target = new URL(options.cloudUrl);
    if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) return false;
    const health = await fetchImpl(`http://127.0.0.1:${options.port}/api/health`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!health.ok || (await health.json()).service !== "neurocheckout-community") return false;
    const response = await fetchImpl(`${options.cloudUrl}/api/v1/public/oauth/heartbeat`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${credential.token}`, "X-NeuroCheckout-Community-Version": options.version },
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    // Credentials and network diagnostics must not enter logs or browser responses.
    return false;
  }
}
