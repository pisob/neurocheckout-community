import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rename, unlink, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { orderHistoryCompletion } from "./local-order-history.mjs";

// Shared across server bundles. Never cache a successful authorization: each
// caller must still prove local health and obtain a fresh Cloud response.
const attempts = globalThis.__ncAvailabilityAttempts ||= new Map();
function attemptState(options, content) {
  const scope = createHash("sha256").update(JSON.stringify([
    resolve(options.directory), options.cloudUrl, options.clientId, options.port,
  ])).digest("hex");
  const credentialVersion = createHash("sha256").update(content).update(String(options.version)).digest("hex");
  const now = Date.now();
  for (const [key, state] of attempts) {
    if (!state.running && now - state.touched > 3600000) attempts.delete(key);
  }
  let state = attempts.get(scope);
  if (!state || state.credentialVersion !== credentialVersion) {
    // Bound memory without evicting active cooldowns under concurrent callers.
    if (!state && attempts.size >= 256) return null;
    state = { running: false, failures: 0, nextAttempt: 0, touched: now, credentialVersion };
    attempts.set(scope, state);
  }
  return state;
}

function pauseAttempt(state, status) {
  state.failures = Math.min(state.failures + 1, 6);
  const authorizationRejected = [401, 403, 426].includes(status);
  const limit = authorizationRejected ? 900000 : 120000;
  state.nextAttempt = Date.now() + Math.min(limit, 30000 * 2 ** (state.failures - 1));
  state.touched = Date.now();
}

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
  let state;
  let ownsAttempt = false;
  try {
    const content = await readFile(resolve(options.directory, "availability.enc"));
    const decipher = createDecipheriv("aes-256-gcm", key(options.secret), content.subarray(0, 12));
    decipher.setAuthTag(content.subarray(12, 28));
    const credential = JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString("utf8"));
    if (credential.cloudUrl !== options.cloudUrl || credential.clientId !== options.clientId) return false;
    if (!/^nc_live_[A-Za-z0-9_-]{43}$/.test(credential.token)) return false;
    const target = new URL(options.cloudUrl);
    if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) return false;
    state = attemptState(options, content);
    if (!state || state.running || Date.now() < state.nextAttempt) return false;
    state.running = true;
    ownsAttempt = true;
    const health = await fetchImpl(`http://127.0.0.1:${options.port}/api/health`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!health.ok || (await health.json()).service !== "neurocheckout-community") return false;
    const completion = orderHistoryCompletion(options);
    const response = await fetchImpl(`${options.cloudUrl}/api/v1/public/oauth/heartbeat`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${credential.token}`, "X-NeuroCheckout-Community-Version": options.version,
        ...(completion ? {"X-NeuroCheckout-Order-History": JSON.stringify(completion)} : {}) },
    });
    await response.body?.cancel();
    if (!response.ok) pauseAttempt(state, response.status);
    else { state.failures = 0; state.nextAttempt = 0; state.touched = Date.now(); }
    return response.ok;
  } catch {
    // Credentials and network diagnostics must not enter logs or browser responses.
    if (ownsAttempt) pauseAttempt(state, 0);
    return false;
  } finally {
    if (ownsAttempt) state.running = false;
  }
}
