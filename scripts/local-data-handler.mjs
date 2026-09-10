import { createHash, timingSafeEqual } from "node:crypto";
import { LocalDataStore, MAX_BODY_BYTES, mac } from "./local-data-store.mjs";

const paths = { write: "/api/local-data/v1/records", read: "/api/local-data/v1/read" };
export function signLocalRequest(secret, method, path, timestamp, nonce, body) {
  return mac(secret, ["nc-local-data-v1", method, path, timestamp, nonce, createHash("sha256").update(body).digest("hex")].join("\n"));
}
function response(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private", "Pragma": "no-cache" } });
}
async function boundedBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("local_data_payload_too_large");
  if (!request.body) throw new Error("local_data_record_invalid");
  const reader = request.body.getReader(); const parts = []; let size = 0;
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      let timer;
      let chunk;
      try {
        chunk = await Promise.race([reader.read(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("local_data_body_timeout")), Math.max(1, deadline - Date.now()));
        })]);
      } finally { clearTimeout(timer); }
      const { done, value } = chunk;
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("local_data_payload_too_large"); }
      parts.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}

export async function handleLocalData(request, role, options) {
  // A distinct operator flag prevents accidentally activating the pilot in production.
  if (!options.enabled || options.environment !== "staging") return response(404, { error: "not_found" });
  let store;
  try {
    const url = new URL(request.url);
    if (!paths[role] || request.method !== "POST" || url.pathname !== paths[role] || url.search || request.headers.has("origin") || request.headers.has("cookie")) return response(403, { error: "local_data_forbidden" });
    if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json" || request.headers.has("content-encoding")) return response(415, { error: "local_data_json_required" });
    const timestamp = request.headers.get("x-nc-data-time") || "";
    const nonce = request.headers.get("x-nc-data-nonce") || "";
    const signature = request.headers.get("x-nc-data-signature") || "";
    if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 120_000 || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return response(401, { error: "local_data_unauthorized" });
    const body = await boundedBody(request);
    store = new LocalDataStore(options.directory);
    const secret = role === "write" ? store.config.ingestionKey : store.config.readKey;
    const expected = signLocalRequest(secret, request.method, url.pathname, timestamp, nonce, body);
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return response(401, { error: "local_data_unauthorized" });
    store.consumeNonce(role, nonce);
    let input;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { return response(400, { error: "local_data_record_invalid" }); }
    const result = role === "write" ? store.put(input) : store.read(input);
    const output = JSON.stringify(result);
    return new Response(output, { status: 200, headers: {
      "Content-Type": "application/json", "Cache-Control": "no-store, private", "Pragma": "no-cache",
      "X-NC-Data-Response": mac(secret, `nc-local-data-response-v1\n${nonce}\n${createHash("sha256").update(output).digest("hex")}`),
    } });
  } catch (error) {
    const codes = { local_data_body_timeout: 408, local_data_record_invalid: 422, local_data_record_stale: 422,
      local_data_payload_too_large: 413, local_data_revision_conflict: 409,
      local_data_revision_not_ready: 409, local_data_record_deleted: 410,
      local_data_record_missing: 404, local_data_replay: 409, local_data_rate_limited: 429,
      local_data_source_managed: 409,
      local_data_capacity_exceeded: 507 };
    // Do not expose DB diagnostics, paths, customer payloads or credentials.
    const status = codes[error?.message];
    return response(status || 503, { error: status ? error.message : "local_data_unavailable" });
  } finally { store?.close(); }
}
