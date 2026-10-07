import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { LocalDataStore, mac } from "./local-data-store.mjs";
import { supportedEnvironment } from "./deployment-environment.mjs";
import { SourceSynchronizer, connectorEndpoint, SOURCE_PAGE_BYTES, SOURCE_PAGE_RECORDS } from "./local-source-sync.mjs";
import { recordSourceDiagnostic, sourceFailureCode } from './source-diagnostic.mjs';

const denied = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0",8], ["10.0.0.0",8], ["100.64.0.0",10], ["127.0.0.0",8],
  ["169.254.0.0",16], ["172.16.0.0",12], ["192.0.0.0",24], ["192.0.2.0",24],
  ["192.88.99.0",24], ["192.168.0.0",16], ["198.18.0.0",15], ["198.51.100.0",24],
  ["203.0.113.0",24], ["224.0.0.0",4], ["240.0.0.0",4],
]) denied.addSubnet(network, prefix, "ipv4");

export async function publicSourceTarget(endpoint, resolver = lookup) {
  const url = connectorEndpoint(endpoint);
  let timer;
  try {
    // This first staging transport deliberately uses public IPv4 only.
    const answers = await Promise.race([
      resolver(url.hostname, { all: true, family: 4, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("source_unavailable")), 5000); }),
    ]);
    if (!Array.isArray(answers) || !answers.length || answers.length > 32 || answers.some(answer =>
      isIP(answer.address) !== 4 || denied.check(answer.address, "ipv4"))) throw new Error("source_unavailable");
    return { url, address: answers[0].address };
  } finally { clearTimeout(timer); }
}

export function sourceRequestSignature(secret, path, shopId, timestamp, nonce, body) {
  return mac(secret, ["nc-source-pull-v1", "POST", path, shopId, timestamp, nonce, createHash("sha256").update(body).digest("hex")].join("\n"));
}
export function sourceResponseSignature(secret, nonce, body) {
  return mac(secret, ["nc-source-response-v1", nonce, createHash("sha256").update(body).digest("hex")].join("\n"));
}

export async function postSourcePage(endpoint, body, headers, { resolveTarget = publicSourceTarget, httpsRequest = request } = {}) {
  const { url, address } = await resolveTarget(endpoint);
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: url.hostname, servername: url.hostname, port: 443, path: url.pathname,
      method: "POST", agent: false, family: 4, autoSelectFamily: false,
      rejectUnauthorized: true, signal: AbortSignal.timeout(10_000),
      // Pin the vetted address while retaining TLS verification for the original hostname.
      lookup: (_hostname, options, callback) => options.all
        ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
      headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)), "Accept-Encoding": "identity" },
    }, res => {
      const abort = (code = "source_unavailable") => { reject(new Error(code)); res.destroy(); req.destroy(); };
      if ([401, 403].includes(res.statusCode)) { abort('source_auth_rejected'); return; }
      if (res.statusCode !== 200 || (res.headers["content-encoding"] || "identity") !== "identity" ||
          (res.headers["content-type"] || "").split(";")[0] !== "application/json" ||
          Number(res.headers["content-length"] || 0) > SOURCE_PAGE_BYTES) { abort(); return; }
      let size = 0; const chunks = [];
      res.on("data", chunk => {
        size += chunk.length;
        if (size > SOURCE_PAGE_BYTES) { abort(); return; }
        chunks.push(chunk);
      });
      res.on("error", () => reject(new Error("source_unavailable")));
      res.on("aborted", () => reject(new Error("source_unavailable")));
      res.on("end", () => resolve({ body: Buffer.concat(chunks), signature: res.headers["x-nc-source-response"] }));
    });
    req.on("error", () => reject(new Error("source_unavailable")));
    req.end(body);
  });
}

export async function pullSourceOnce(options, transport = postSourcePage) {
  if (!options.enabled || !supportedEnvironment(options.environment)) return { ok: false };
  let store, sync, lease;
  try {
    store = new LocalDataStore(options.directory, Date.now, options.environment);
    sync = new SourceSynchronizer(store);
    const configuration = sync.configuration();
    lease = sync.claim();
    const body = JSON.stringify({ schema: 1, shopId: store.config.shopId,
      streamId: lease.streamId, cursor: lease.cursor, limit: SOURCE_PAGE_RECORDS });
    const nonce = randomBytes(16).toString("hex"), timestamp = String(Date.now());
    const path = connectorEndpoint(configuration.endpoint).pathname;
    const response = await transport(configuration.endpoint, body, {
      "Content-Type": "application/json", "Cache-Control": "no-store",
      "X-NC-Source-Time": timestamp, "X-NC-Source-Nonce": nonce,
      "X-NC-Source-Signature": sourceRequestSignature(configuration.secret, path, store.config.shopId, timestamp, nonce, body),
    });
    if (!Buffer.isBuffer(response.body) || response.body.length > SOURCE_PAGE_BYTES ||
        typeof response.signature !== "string" || !/^[a-f0-9]{64}$/.test(response.signature) ||
        !timingSafeEqual(Buffer.from(response.signature, "hex"), Buffer.from(sourceResponseSignature(configuration.secret, nonce, response.body), "hex"))) throw new Error("source_signature_rejected");
    const page = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
    const applied = sync.apply(page, lease);
    try { recordSourceDiagnostic(store, 'ok'); } catch { /* Diagnostics must not replay an acknowledged page. */ }
    return { ok: true, ...applied };
  } catch (error) {
    // No raw payload, source URL, cursor or private diagnostic in logs/dashboard.
    if (sync && lease) { try { sync.failed(lease); } catch {} }
    if (store && error?.message !== 'source_sync_busy') {
      try { recordSourceDiagnostic(store, sourceFailureCode(error)); } catch {}
    }
    return { ok: false };
  } finally { store?.close(); }
}

export function pauseSourceReads(options) {
  if (!options.enabled || !supportedEnvironment(options.environment)) return;
  let store;
  try {
    store = new LocalDataStore(options.directory, Date.now, options.environment);
    if (store.db.prepare("SELECT 1 FROM meta WHERE name='source_pull_bound'").get()) {
      store.db.prepare("UPDATE source_sync SET ready=0 WHERE id=1").run();
    }
  } finally { store?.close(); }
}
