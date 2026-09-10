import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, lstat, open, writeFile, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { LocalDataStore, initializeLocalData } from "./local-data-store.mjs";

const key = secret => {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("relay_configuration_invalid");
  return createHash("sha256").update("community-outgoing-relay-v1\0" + secret).digest();
};
function validCredential(value) {
  return value && /^nc_data_[A-Za-z0-9_-]{43}$/.test(value.token) &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.installation_id) &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.shop_id);
}
function permitted(options) {
  if (!options.enabled || options.environment !== "staging") return false;
  const url = new URL(options.cloudUrl);
  return !url.username && !url.password && !url.search && !url.hash &&
    (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)));
}

export async function saveRelayCredential(options, credential) {
  if (!permitted(options) || !validCredential(credential) || Object.keys(credential).length !== 3) throw new Error("relay_configuration_invalid");
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error("relay_private_directory_required");
  try { await lstat(resolve(directory, "local-data-keys.json")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    initializeLocalData(directory, credential.shop_id);
  }
  const store = new LocalDataStore(directory);
  try {
    if (store.config.shopId !== credential.shop_id) throw new Error("relay_store_mismatch");
    store.bindInstallation(credential.installation_id);
  } finally { store.close(); }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(options.secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...credential, cloudUrl: options.cloudUrl, clientId: options.clientId })), cipher.final()]);
  const temporary = resolve(directory, `relay-${randomBytes(12).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: "wx" });
    await rename(temporary, resolve(directory, "data-relay.enc"));
  } finally { await unlink(temporary).catch(() => {}); }
}

async function load(options) {
  const directory = await lstat(resolve(options.directory));
  if (!directory.isDirectory() || (directory.mode & 0o077) || directory.uid !== process.getuid?.()) throw new Error("relay_private_directory_required");
  const file = resolve(options.directory, "data-relay.enc");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let content;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error("relay_private_file_required");
    content = await handle.readFile();
  } finally { await handle.close(); }
  const cipher = createDecipheriv("aes-256-gcm", key(options.secret), content.subarray(0, 12));
  cipher.setAuthTag(content.subarray(12, 28));
  const value = JSON.parse(Buffer.concat([cipher.update(content.subarray(28)), cipher.final()]).toString("utf8"));
  if (!validCredential(value) || value.cloudUrl !== options.cloudUrl || value.clientId !== options.clientId) throw new Error("relay_configuration_invalid");
  return value;
}

async function smallJson(response, limit) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("relay_unavailable");
  }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("relay_invalid"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function relayOnce(options, fetchImpl = fetch) {
  try {
    if (!permitted(options)) return false;
    const credential = await load(options);
    const health = await fetchImpl(`http://127.0.0.1:${options.port}/api/health`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if ((await smallJson(health, 2048)).service !== "neurocheckout-community") return false;
    const headers = { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json", "X-NeuroCheckout-Community-Version": options.version };
    const response = await fetchImpl(`${options.cloudUrl}/api/v1/public/community-relay/poll`, {
      method: "POST", headers, body: "{}", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25_000),
    });
    const item = await smallJson(response, 4096);
    if (!item || Object.keys(item).length !== 1 || !Array.isArray(item.commands) || item.commands.length > 1) return false;
    for (const command of item.commands) {
      if (!command || Object.keys(command).sort().join(",") !== "operation,record,request_id" || command.operation !== "read" || !/^[a-f0-9]{32}$/.test(command.request_id)) return false;
      let result, store;
      try {
        store = new LocalDataStore(options.directory);
        if (store.config.shopId !== credential.shop_id) throw new Error("relay_store_mismatch");
        store.bindInstallation(credential.installation_id);
        result = { status: "ok", record: store.read(command.record) };
      } catch (error) {
        const statuses = { local_data_record_missing: "missing", local_data_record_deleted: "deleted", local_data_revision_not_ready: "not_ready" };
        result = { status: statuses[error?.message] || "unavailable" };
      } finally { store?.close(); }
      // Reply only on the configured Cloud origin, never on a URL from a command.
      const reply = await fetchImpl(`${options.cloudUrl}/api/v1/public/community-relay/reply`, {
        method: "POST", headers, body: JSON.stringify({ request_id: command.request_id, result }),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      await reply.body?.cancel();
      if (!reply.ok) return false;
    }
    return true;
  } catch {
    // Network loss and private diagnostics are never logged or exposed in the dashboard.
    return false;
  }
}
