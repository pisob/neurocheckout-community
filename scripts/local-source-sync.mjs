// Local storage synchronization only. No agent, scheduling or SMTP decisions.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mac } from "./local-data-store.mjs";

export const SOURCE_PAGE_BYTES = 1024 * 1024;
export const SOURCE_PAGE_RECORDS = 8;
const hex32 = /^[a-f0-9]{32}$/;
const hex64 = /^[a-f0-9]{64}$/;
const fail = () => { throw new Error("source_sync_invalid"); };
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === "object" && Object.keys(value).sort().join(",") === keys.sort().join(",");

export function connectorEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) fail();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
      !/^[A-Za-z0-9.-]+$/.test(url.hostname) || url.hostname.endsWith(".") ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*(?:module\/neurocheckoutconnector\/communitydata|neurocheckout\/community\/pull|wp-json\/neurocheckout\/v1\/communitydata)$/.test(url.pathname)) fail();
  return url;
}

export class SourceSynchronizer {
  constructor(store) {
    this.store = store;
    this.db = store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS source_binding (id INTEGER PRIMARY KEY CHECK(id=1), ciphertext BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS source_sync (
        id INTEGER PRIMARY KEY CHECK(id=1), stream_id TEXT, cursor TEXT NOT NULL DEFAULT '',
        ready INTEGER NOT NULL DEFAULT 0, last_complete_at INTEGER NOT NULL DEFAULT 0,
        last_success_at INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO source_sync(id) VALUES (1);`);
  }

  configure(configuration) {
    if (!exact(configuration, ["endpoint", "secret"]) || typeof configuration.secret !== "string" || !hex64.test(configuration.secret)) fail();
    connectorEndpoint(configuration.endpoint);
    if ([this.store.config.encryptionKey, this.store.config.readKey, this.store.config.ingestionKey].includes(configuration.secret)) fail();
    this.store.transaction(() => {
      const existing = this.db.prepare("SELECT 1 FROM source_binding WHERE id=1").get();
      if (!existing && this.db.prepare("SELECT 1 FROM watermarks LIMIT 1").get()) {
        throw new Error("source_sync_migration_required");
      }
      // A secret may rotate on the same source. A source change needs an explicit migration.
      if (existing && this.configuration().endpoint !== configuration.endpoint) fail();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.store.config.encryptionKey, "hex"), iv);
      cipher.setAAD(Buffer.from(`source-binding-v1:${this.store.config.shopId}`));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(configuration)), cipher.final()]);
      this.db.prepare("INSERT OR REPLACE INTO source_binding VALUES (1,?)").run(Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES ('source_pull_bound','1')").run();
      this.db.prepare("UPDATE source_sync SET ready=0,lease_token=NULL,lease_until=0 WHERE id=1").run();
    });
  }

  configuration() {
    const row = this.db.prepare("SELECT ciphertext FROM source_binding WHERE id=1").get();
    if (!row) fail();
    const content = Buffer.from(row.ciphertext);
    const cipher = createDecipheriv("aes-256-gcm", Buffer.from(this.store.config.encryptionKey, "hex"), content.subarray(0, 12));
    cipher.setAAD(Buffer.from(`source-binding-v1:${this.store.config.shopId}`));
    cipher.setAuthTag(content.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([cipher.update(content.subarray(28)), cipher.final()]).toString("utf8"));
    if (!exact(value, ["endpoint", "secret"]) || typeof value.secret !== "string" || !hex64.test(value.secret)) fail();
    connectorEndpoint(value.endpoint);
    return value;
  }

  claim() {
    return this.store.transaction(() => {
      if (!this.db.prepare("SELECT 1 FROM source_binding WHERE id=1").get()) fail();
      const state = this.db.prepare("SELECT * FROM source_sync WHERE id=1").get();
      if (state.lease_until > this.store.clock()) throw new Error("source_sync_busy");
      const token = randomBytes(16).toString("hex");
      this.db.prepare("UPDATE source_sync SET ready=0,lease_token=?,lease_until=? WHERE id=1").run(token, this.store.clock() + 30_000);
      return { token, cursor: state.cursor, streamId: state.stream_id };
    });
  }

  failed(lease) {
    this.db.prepare("UPDATE source_sync SET ready=0,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=?").run(lease.token);
  }

  apply(page, lease) {
    if (!exact(page, ["schema", "shopId", "streamId", "cursor", "nextCursor", "complete", "generatedAt", "records"]) ||
        page.schema !== 1 || page.shopId !== this.store.config.shopId || !hex32.test(page.streamId) ||
        (page.cursor !== "" && !hex64.test(page.cursor)) || !hex64.test(page.nextCursor) ||
        typeof page.complete !== "boolean" || !Array.isArray(page.records) || page.records.length > SOURCE_PAGE_RECORDS ||
        typeof page.generatedAt !== "string" || !page.generatedAt.endsWith("Z") ||
        !Number.isFinite(Date.parse(page.generatedAt)) || Math.abs(this.store.clock() - Date.parse(page.generatedAt)) > 30_000 ||
        Buffer.byteLength(JSON.stringify(page)) > SOURCE_PAGE_BYTES ||
        ((!page.complete || page.records.length) && page.cursor === page.nextCursor)) fail();
    return this.store.transaction(() => {
      const state = this.db.prepare("SELECT * FROM source_sync WHERE id=1").get();
      if (state.lease_token !== lease.token || state.lease_until <= this.store.clock() || state.cursor !== page.cursor ||
          (state.stream_id && state.stream_id !== page.streamId)) fail();
      const seen = new Set();
      for (const record of page.records) {
        if (!record || typeof record !== "object") fail();
        const ref = mac(this.store.config.encryptionKey, JSON.stringify([record.kind, record.sourceId]));
        if (seen.has(ref)) fail();
        seen.add(ref);
        this.store.putInTransaction(record);
      }
      const now = this.store.clock();
      this.db.prepare(`UPDATE source_sync SET stream_id=?,cursor=?,ready=?,last_success_at=?,
        last_complete_at=?,lease_token=NULL,lease_until=0 WHERE id=1`).run(
        page.streamId, page.nextCursor, page.complete ? 1 : 0, now, page.complete ? now : state.last_complete_at,
      );
      return { count: page.records.length, complete: page.complete };
    });
  }
}
