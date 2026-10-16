// Data transport only. Selection, ranking and all marketing decisions stay in Cloud.
import { timingSafeEqual } from "node:crypto";
import { mac } from "./local-data-store.mjs";

export const CATALOG_PAGE_BYTES = 160 * 1024;
export const CATALOG_PAGE_RECORDS = 32;
const MAX_RECORDS = 10_000;
const CURSOR_LIFETIME_MS = 120_000;
const hex = /^[a-f0-9]{64}$/;
const fail = (code = "local_catalog_invalid") => { throw new Error(code); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === keys.sort().join(",");

export function readLocalCatalog(store, input) {
  if (!exact(input, ["cursor"]) || typeof input.cursor !== "string"
      || input.cursor.length > 512 || (input.cursor && !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(input.cursor))) fail();
  return store.transaction(() => {
    store.requireSourceFresh();
    const installation = store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
    if (!installation) fail();
    const now = store.clock();
    const sign = body => mac(store.config.encryptionKey,
      `catalog-cursor-v1\0${store.config.shopId}\0${installation}\0${body}`);
    let after = "", generation = "", expires = now + CURSOR_LIFETIME_MS;
    if (input.cursor) {
      const [body, signature] = input.cursor.split(".");
      if (!timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))) fail();
      let decoded;
      try { decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
      catch { fail(); }
      if (!exact(decoded, ["after", "generation", "expires"]) || !hex.test(decoded.after)
          || !hex.test(decoded.generation) || !Number.isSafeInteger(decoded.expires)) fail();
      if (decoded.expires <= now || decoded.expires > now + CURSOR_LIFETIME_MS) fail("local_catalog_changed");
      ({ after, generation, expires } = decoded);
    }
    // A revision, deletion, expiry or insertion invalidates all previous pages.
    // Do not store a plaintext catalog or a server-side cursor/snapshot.
    const manifest = store.db.prepare(`SELECT reference,revision,digest,expires_at FROM records
      WHERE kind='product' AND operation='upsert' AND expires_at>? ORDER BY reference LIMIT ?`).all(now, MAX_RECORDS + 1);
    if (manifest.length > MAX_RECORDS) fail("local_catalog_capacity_exceeded");
    const currentGeneration = mac(store.config.encryptionKey, JSON.stringify(["catalog-generation-v1", manifest]));
    if (generation && generation !== currentGeneration) fail("local_catalog_changed");
    generation = currentGeneration;
    if (after && !manifest.some(row => row.reference === after)) fail("local_catalog_changed");
    const page = { schema: 1, shopId: store.config.shopId, installationId: installation,
      generation, count: manifest.length, records: [], nextCursor: "", readAt: new Date(now).toISOString() };
    const remaining = manifest.filter(row => row.reference > after);
    // Reserve space for the envelope and the signed continuation token.
    let size = Buffer.byteLength(JSON.stringify(page)) + 1024;
    for (const row of remaining.slice(0, CATALOG_PAGE_RECORDS)) {
      const record = store.read({ kind: "product", reference: row.reference, minimumRevision: row.revision });
      const bytes = Buffer.byteLength(JSON.stringify(record)) + 1;
      if (size + bytes > CATALOG_PAGE_BYTES) break;
      page.records.push(record);
      size += bytes;
    }
    if (remaining.length && !page.records.length) fail("local_catalog_capacity_exceeded");
    if (page.records.length < remaining.length) {
      const body = Buffer.from(JSON.stringify({ after: page.records.at(-1).reference, generation, expires })).toString("base64url");
      page.nextCursor = `${body}.${sign(body)}`;
    }
    if (Buffer.byteLength(JSON.stringify(page)) > CATALOG_PAGE_BYTES) fail("local_catalog_capacity_exceeded");
    return page;
  });
}
