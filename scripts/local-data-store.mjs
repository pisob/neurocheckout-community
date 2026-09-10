// Staging pilot. No agent, scheduling or SMTP logic belongs in this module.
import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, lstatSync, fstatSync, chmodSync, openSync, closeSync, readFileSync, writeFileSync, constants } from "node:fs";
import { resolve } from "node:path";

export const MAX_BODY_BYTES = 192 * 1024;
const RETENTION_MS = 30 * 86400_000;
const MAX_ROWS = 10_000;
const MAX_OUTBOX = 50_000;
// Keep only opaque revision metadata after payload expiry. Never forget an old
// revision and silently resurrect it; require an explicit migration at capacity.
const MAX_WATERMARKS = 100_000;
const MAX_ENCRYPTED_BYTES = 128 * 1024 * 1024;
const kinds = new Set(["product", "cart"]);
const hexKey = /^[a-f0-9]{64}$/;
const fail = (code) => { throw new Error(code); };
export const mac = (secret, value) => createHmac("sha256", Buffer.from(secret, "hex")).update(value).digest("hex");

function privateDirectory(directory) {
  const path = resolve(directory);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) fail("local_data_private_directory_required");
  return path;
}

function readPrivate(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid?.() || stat.size > 4096) fail("local_data_private_file_required");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}

export function initializeLocalData(directory, shopId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(shopId)) fail("local_data_shop_invalid");
  const path = privateDirectory(directory);
  const config = { schema: 1, environment: "staging", shopId,
    encryptionKey: randomBytes(32).toString("hex"),
    ingestionKey: randomBytes(32).toString("hex"), readKey: randomBytes(32).toString("hex") };
  // Never overwrite keys: doing so would make the existing database unreadable.
  writeFileSync(resolve(path, "local-data-keys.json"), JSON.stringify(config), { mode: 0o600, flag: "wx" });
  return { shopId, environment: "staging" };
}

export function loadLocalDataConfig(directory) {
  const path = privateDirectory(directory);
  const config = JSON.parse(readPrivate(resolve(path, "local-data-keys.json")));
  if (config.schema !== 1 || config.environment !== "staging" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(config.shopId) ||
      ![config.encryptionKey, config.ingestionKey, config.readKey].every(v => typeof v === "string" && hexKey.test(v)) ||
      new Set([config.encryptionKey, config.ingestionKey, config.readKey]).size !== 3) fail("local_data_configuration_invalid");
  return config;
}

export class LocalDataStore {
  constructor(directory, clock = Date.now) {
    this.config = loadLocalDataConfig(directory);
    this.clock = clock;
    const path = resolve(directory, "local-data.sqlite");
    const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    closeSync(fd);
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) fail("local_data_private_file_required");
    this.db = new DatabaseSync(path, { allowExtension: false });
    try {
      this.db.exec(`PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON;
        PRAGMA max_page_count=65536;
        CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS records (
          kind TEXT NOT NULL, reference TEXT NOT NULL, revision INTEGER NOT NULL,
          operation TEXT NOT NULL, observed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
          digest TEXT NOT NULL, ciphertext BLOB NOT NULL, PRIMARY KEY(kind, reference));
        CREATE TABLE IF NOT EXISTS history (
          kind TEXT NOT NULL, reference TEXT NOT NULL, revision INTEGER NOT NULL,
          operation TEXT NOT NULL, observed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
          digest TEXT NOT NULL, ciphertext BLOB NOT NULL, PRIMARY KEY(kind, reference, revision));
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, reference TEXT NOT NULL,
          revision INTEGER NOT NULL, operation TEXT NOT NULL, observed_at INTEGER NOT NULL,
          UNIQUE(kind,reference,revision));
        CREATE TABLE IF NOT EXISTS watermarks (
          kind TEXT NOT NULL, reference TEXT NOT NULL, revision INTEGER NOT NULL,
          observed_at INTEGER NOT NULL, PRIMARY KEY(kind,reference));
        CREATE TABLE IF NOT EXISTS nonces (role TEXT NOT NULL, nonce TEXT NOT NULL, created_at INTEGER NOT NULL,
          PRIMARY KEY(role,nonce));`);
      const verifier = mac(this.config.encryptionKey, `local-data-v1:${this.config.shopId}`);
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('key_verifier', ?)").run(verifier);
      if (this.db.prepare("SELECT value FROM meta WHERE name='key_verifier'").get().value !== verifier) fail("local_data_key_mismatch");
      // Upgrade the candidate schema before any cleanup can discard payloads.
      this.db.exec(`INSERT INTO watermarks(kind,reference,revision,observed_at)
        SELECT kind,reference,revision,observed_at FROM records WHERE true
        ON CONFLICT(kind,reference) DO UPDATE SET revision=excluded.revision,
          observed_at=excluded.observed_at WHERE excluded.revision>watermarks.revision;`);
    } catch (error) { this.db.close(); throw error; }
  }

  close() { this.db.close(); }

  bindInstallation(installationId) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(installationId)) fail("local_data_installation_invalid");
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('installation_id',?)").run(installationId);
      if (this.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get().value !== installationId) fail("local_data_installation_mismatch");
    });
  }

  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    this.transactionActive = true;
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
    finally { this.transactionActive = false; }
  }

  consumeNonce(role, nonce) {
    return this.transaction(() => {
      const now = this.clock();
      this.db.prepare("DELETE FROM nonces WHERE created_at < ?").run(now - 360_000);
      if (this.db.prepare("SELECT 1 FROM nonces WHERE role=? AND nonce=?").get(role, nonce)) fail("local_data_replay");
      if (this.db.prepare("SELECT count(*) AS n FROM nonces WHERE role=? AND created_at>=?").get(role, now - 60_000).n >= 120) fail("local_data_rate_limited");
      this.db.prepare("INSERT INTO nonces VALUES (?,?,?)").run(role, nonce, now);
    });
  }

  reference(kind, sourceId) {
    return mac(this.config.encryptionKey, JSON.stringify(["reference-v1", this.config.shopId, kind, sourceId]));
  }

  cleanup() {
    const expiry = this.clock();
    this.db.prepare("DELETE FROM records WHERE expires_at <= ?").run(expiry);
    this.db.prepare("DELETE FROM history WHERE expires_at <= ?").run(expiry);
    // Signals are bounded and contain no raw details. Expired signals cannot resume an old cart.
    this.db.prepare("DELETE FROM outbox WHERE observed_at <= ?").run(expiry - RETENTION_MS);
  }

  put(input) {
    return this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM meta WHERE name='source_pull_bound'").get()) fail("local_data_source_managed");
      return this.putInTransaction(input);
    });
  }

  // Internal batch primitive. Call only inside the store's write transaction.
  putInTransaction(input) {
    if (!this.transactionActive) fail("local_data_transaction_required");
    if (!input || Array.isArray(input) || Object.keys(input).some(k => !["kind", "sourceId", "revision", "operation", "observedAt", "payload"].includes(k)) ||
        !kinds.has(input.kind) || typeof input.sourceId !== "string" || input.sourceId.length < 1 || input.sourceId.length > 256 ||
        !Number.isSafeInteger(input.revision) || input.revision < 1 || !["upsert", "delete"].includes(input.operation)) fail("local_data_record_invalid");
    if (typeof input.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.observedAt)) fail("local_data_record_invalid");
    const observed = Date.parse(input.observedAt);
    if (!Number.isFinite(observed) || observed > this.clock() + 60_000 || observed <= this.clock() - RETENTION_MS) fail("local_data_record_stale");
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload) ||
        (input.operation === "delete" && Object.keys(input.payload).length)) fail("local_data_record_invalid");
    const serialized = JSON.stringify(input.payload);
    if (Buffer.byteLength(serialized) > 128 * 1024) fail("local_data_payload_too_large");
    const reference = this.reference(input.kind, input.sourceId);
    const digest = mac(this.config.encryptionKey, JSON.stringify([input.operation, observed, serialized]));
      this.cleanup();
      const old = this.db.prepare("SELECT * FROM records WHERE kind=? AND reference=?").get(input.kind, reference);
      if (old && old.revision === input.revision && old.digest === digest) return { reference, revision: old.revision, deduplicated: true };
      const watermark = this.db.prepare("SELECT revision,observed_at FROM watermarks WHERE kind=? AND reference=?").get(input.kind, reference);
      if (watermark && (input.revision <= watermark.revision || observed < watermark.observed_at)) fail("local_data_revision_conflict");
      if (!watermark && this.db.prepare("SELECT count(*) AS n FROM watermarks").get().n >= MAX_WATERMARKS) fail("local_data_capacity_exceeded");
      if ((!old && this.db.prepare("SELECT count(*) AS n FROM records").get().n >= MAX_ROWS) ||
          this.db.prepare("SELECT count(*) AS n FROM outbox").get().n >= MAX_OUTBOX) fail("local_data_capacity_exceeded");
      const used = this.db.prepare("SELECT (SELECT coalesce(sum(length(ciphertext)),0) FROM records) + (SELECT coalesce(sum(length(ciphertext)),0) FROM history) AS n").get().n;
      if (used + Buffer.byteLength(serialized) + 28 > MAX_ENCRYPTED_BYTES) fail("local_data_capacity_exceeded");
      const expires = observed + RETENTION_MS;
      const aad = JSON.stringify([1, this.config.shopId, input.kind, reference, input.revision, input.operation, observed, expires]);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.config.encryptionKey, "hex"), iv);
      cipher.setAAD(Buffer.from(aad));
      const encrypted = Buffer.concat([cipher.update(serialized), cipher.final()]);
      const ciphertext = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      if (old) this.db.prepare("INSERT OR IGNORE INTO history VALUES (?,?,?,?,?,?,?,?)").run(old.kind, old.reference, old.revision, old.operation, old.observed_at, old.expires_at, old.digest, old.ciphertext);
      this.db.prepare("INSERT OR REPLACE INTO records VALUES (?,?,?,?,?,?,?,?)").run(input.kind, reference, input.revision, input.operation, observed, expires, digest, ciphertext);
      this.db.prepare("DELETE FROM history WHERE kind=? AND reference=? AND revision NOT IN (SELECT revision FROM history WHERE kind=? AND reference=? ORDER BY revision DESC LIMIT 10)").run(input.kind, reference, input.kind, reference);
      this.db.prepare("INSERT INTO outbox(kind,reference,revision,operation,observed_at) VALUES (?,?,?,?,?)").run(input.kind, reference, input.revision, input.operation, observed);
      this.db.prepare("INSERT OR REPLACE INTO watermarks VALUES (?,?,?,?)").run(input.kind, reference, input.revision, observed);
      return { reference, revision: input.revision, deduplicated: false };
  }

  requireSourceFresh() {
    if (!this.db.prepare("SELECT 1 FROM meta WHERE name='source_pull_bound'").get()) return;
    const state = this.db.prepare("SELECT ready,last_complete_at FROM source_sync WHERE id=1").get();
    const age = this.clock() - (state?.last_complete_at || 0);
    if (!state?.ready || age < -5000 || age > 60_000) fail("local_data_source_unavailable");
  }

  read(input) {
    this.requireSourceFresh();
    if (!input || Object.keys(input).some(k => !["kind", "reference", "minimumRevision"].includes(k)) ||
        !kinds.has(input.kind) || typeof input.reference !== "string" || !hexKey.test(input.reference) ||
        !Number.isSafeInteger(input.minimumRevision) || input.minimumRevision < 1) fail("local_data_record_invalid");
    const row = this.db.prepare("SELECT * FROM records WHERE kind=? AND reference=?").get(input.kind, input.reference);
    if (!row || row.expires_at <= this.clock()) fail("local_data_record_missing");
    if (row.revision < input.minimumRevision) fail("local_data_revision_not_ready");
    if (row.operation === "delete") fail("local_data_record_deleted");
    const aad = JSON.stringify([1, this.config.shopId, row.kind, row.reference, row.revision, row.operation, row.observed_at, row.expires_at]);
    const content = Buffer.from(row.ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.config.encryptionKey, "hex"), content.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(content.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString("utf8"));
    return { shopId: this.config.shopId, kind: row.kind, reference: row.reference, revision: row.revision,
      observedAt: new Date(row.observed_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
      readAt: new Date(this.clock()).toISOString(), payload };
  }

  signals(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("local_data_limit_invalid");
    return this.db.prepare("SELECT id,kind,reference,revision,operation,observed_at FROM outbox WHERE observed_at > ? ORDER BY id LIMIT ?").all(this.clock() - RETENTION_MS, limit);
  }

  backup(destination) {
    if (!destination || !destination.startsWith("/")) fail("local_data_absolute_backup_path_required");
    // A new directory only, never overwrite another backup or the live vault.
    mkdirSync(destination, { mode: 0o700 });
    const path = privateDirectory(destination);
    const database = resolve(path, "local-data.sqlite");
    this.db.prepare("VACUUM INTO ?").run(database);
    chmodSync(database, 0o600);
    writeFileSync(resolve(path, "local-data-keys.json"), JSON.stringify(this.config), { flag: "wx", mode: 0o600 });
    return { complete: true };
  }
}
