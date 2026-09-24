import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { initializeLocalData, loadLocalDataConfig } from "./local-data-store.mjs";
import { signLocalRequest } from "./local-data-handler.mjs";
import { EmailArchive } from "./email-archive.mjs";

const host = "127.0.0.1";
const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const communityPort = 43118;
const communityOrigin = `http://${host}:${communityPort}`;
const cookies = new Map();
let failureMode = "";
let mutations = 0;
let targetBlocked = false;
const availabilityToken = "nc_live_" + randomBytes(32).toString("base64url");
const relayToken = "nc_data_" + randomBytes(32).toString("base64url");
let relayReference = "";
let signalBatches = 0;
let relayReads = 0;
let heartbeats = 0;
let refreshRequests = 0;
const updateDirectory = mkdtempSync(join(tmpdir(), "nc-update-api-test-"));
const stateDirectory = join(updateDirectory, "private-state");
initializeLocalData(stateDirectory, "synthetic-shop");
const localKeys = loadLocalDataConfig(stateDirectory);
const emailArchive=new EmailArchive(stateDirectory);
for(const id of [1,2])emailArchive.prepare({delivery_id:`community-edge-${id}`,recipient_email:'email-copy@example.invalid',subject:'Archived original',body_html:'<p>PRIVATE ARCHIVED ORIGINAL</p>',body_text:'PRIVATE ARCHIVED ORIGINAL',agent_name:'abandoned_cart',copy_signature:'a'.repeat(64)});
emailArchive.close();
const observed = {
  tokenExchange: false,
  capabilities: false,
  shopList: false,
  planSelection: false,
  checkout: false,
  checkoutConfirmation: false,
  upgrade: false,
  billingPortal: false,
};

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const cloud = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/v1/public/oauth/token") {
    const body = JSON.parse(await requestBody(request));
    if (body.grant_type === "refresh_token") {
      assert.equal(body.client_id, "community-smoke-client");
      assert.equal(body.refresh_token, "smoke-refresh-token");
      refreshRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return json(response, 200, {
        access_token: "smoke-refreshed-access-token",
        refresh_token: "smoke-refreshed-refresh-token",
        expires_in: 900,
        scope: "openid capabilities:read shops:read billing:write",
      });
    }
    assert.equal(body.grant_type, "authorization_code");
    assert.equal(body.client_id, "community-smoke-client");
    assert.equal(body.code, "smoke-authorization-code");
    assert.equal(body.redirect_uri, `${communityOrigin}/api/auth/callback`);
    assert.ok(body.code_verifier.length >= 43);
    observed.tokenExchange = true;
    if (failureMode === "token") return json(response, 500, { detail: "synthetic-private-diagnostic" });
    return json(response, 200, {
      access_token: "smoke-access-token",
      refresh_token: "smoke-refresh-token",
      expires_in: 1,
      scope: "openid capabilities:read shops:read billing:write",
      availability_token: availabilityToken,
      local_data_credential: { token: relayToken, installation_id: "11111111-1111-4111-8111-111111111111", shop_id: "synthetic-shop" },
    });
  }

  if (request.method === "POST" && request.url === "/api/v1/public/oauth/heartbeat") {
    assert.equal(request.headers.authorization, `Bearer ${availabilityToken}`);
    assert.equal(request.headers["x-neurocheckout-community-version"], packageVersion);
    heartbeats += 1;
    return json(response, 200, { ok: true });
  }
  if (request.method === "POST" && request.url === "/api/v1/public/community-relay/poll") {
    assert.equal(request.headers.authorization, `Bearer ${relayToken}`);
    // Independent background loops need not finish in the same order.
    // Keep a realistic relay delay so a heartbeat cannot stand in for a reply.
    await new Promise(resolve => setTimeout(resolve, 500));
    const commands = relayReference ? [{ request_id: "a".repeat(32), operation: "read", record: { kind: "cart", reference: relayReference, minimumRevision: 1 } }] : [];
    return json(response, 200, { commands });
  }
  if (request.method === "POST" && request.url === "/api/v1/public/community-relay/signals") {
    assert.equal(request.headers.authorization, `Bearer ${relayToken}`);
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(Object.keys(body), ["signals"]);
    assert.ok(body.signals.length >= 1);
    assert.equal(JSON.stringify(body).includes("private-smoke@example.invalid"), false);
    signalBatches += 1;
    return json(response, 200, { accepted_ids: body.signals.map(signal => signal.id) });
  }
  if (request.method === "POST" && request.url === "/api/v1/public/community-relay/reply") {
    assert.equal(request.headers.authorization, `Bearer ${relayToken}`);
    const reply = JSON.parse(await requestBody(request));
    assert.equal(reply.result.status, "ok");
    assert.equal(reply.result.record.payload.status, "abandoned");
    relayReads++;
    return json(response, 200, { accepted: true });
  }
  assert.equal(request.headers.authorization, "Bearer smoke-refreshed-access-token");
  assert.ok([packageVersion, "99.0.0"].includes(request.headers["x-neurocheckout-community-version"]));

  if (request.method === "GET" && request.url === "/api/v1/member/capabilities") {
    if (failureMode === "transport") return request.socket.destroy();
    observed.capabilities = true;
    return json(response, 200, {
      plan: { code: "community" },
      dashboard: {
        latest_version: "99.0.0", allowed_versions: [packageVersion, "99.0.0"],
        current_version: request.headers["x-neurocheckout-community-version"],
        update_recommended: true, update_required: targetBlocked,
        version_status: targetBlocked ? "blocked" : "compatible",
      },
      quotas: { email: { limit: 100, window: "rolling_24h" } },
    });
  }

  if (request.method === "GET" && request.url === "/api/v1/member/shops") {
    observed.shopList = true;
    return json(response, 200, {
      items: [{ shop_uuid: "33333333-3333-4333-8333-333333333333", shop_id: "shop_smoke", platform: "woocommerce" }],
    });
  }

  if (request.method === "POST" && request.url === "/api/v1/member/onboarding/select-plan") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, { plan_code: "starter", billing_platform: "stripe" });
    observed.planSelection = true;
    return json(response, 200, { plan_code: "starter" });
  }

  if (request.method === "POST" && request.url === "/api/v1/billing/checkout-session") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, {
      billing_cycle: "annual",
      intent_id: "12345678-1234-4234-8234-123456789abc",
      community_return_uri: `${communityOrigin}/`,
    });
    observed.checkout = true;
    return json(response, 200, { checkout_url: "https://checkout.stripe.example/session" });
  }

  if (request.method === "POST" && request.url === "/api/v1/billing/checkout-session/confirm") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, { session_id: "cs_smoke_session_12345678" });
    observed.checkoutConfirmation = true;
    return json(response, 200, { confirmed: true });
  }

  if (request.method === "POST" && request.url === "/api/v1/billing/upgrade-session") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, { billing_cycle: "monthly", community_return_uri: `${communityOrigin}/` });
    observed.upgrade = true;
    return json(response, 200, { portal_url: "https://billing.stripe.example/upgrade" });
  }

  if (request.method === "POST" && request.url === "/api/v1/billing/payment-portal-session") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, { source: "community", community_return_uri: `${communityOrigin}/` });
    observed.billingPortal = true;
    return json(response, 200, { portal_url: "https://billing.stripe.example/portal" });
  }

  if (request.method === "GET" && request.url.startsWith("/api/v1/member/analytics/recent-emails?")) {
    const query=new URL(request.url,cloudOrigin).searchParams;
    if(query.get('shop_uuid')!=='33333333-3333-4333-8333-333333333333')return json(response,403,{detail:'forbidden'});
    return json(response,200,{shop:{shop_uuid:query.get('shop_uuid'),shop_id:failureMode==='archive-shop'?'other-shop':'synthetic-shop'},limit:10,count:1,items:[{delivery_id:'community-edge-1',sent_at:new Date().toISOString(),status:'sent',customer:{}}]});
  }

  if (request.method === "GET" && request.url.startsWith("/api/v1/member/analytics/journey-audit?")) {
    const query = new URL(request.url, cloudOrigin).searchParams;
    assert.equal(query.get("shop_uuid"), "33333333-3333-4333-8333-333333333333");
    assert.equal(query.get("days"), "30");
    assert.equal(query.get("limit"), "10");
    assert.equal(query.get("session_page"), "1");
    assert.equal(query.get("session_filter"), "cart");
    return json(response, 200, {
      shop: { shop_uuid: query.get("shop_uuid"), shop_id: "synthetic-shop" },
      audit_count: 1,
      event_summary: { total_events: 4, cart_snapshots: 1 },
      recent_sessions: [],
      recent_audits: [],
      state: "collecting_events",
    });
  }

  if (request.method === "POST" && request.url === "/api/v1/member/notifications/mark-read") {
    mutations += 1;
    return json(response, 200, { ok: true });
  }
  return json(response, 404, { detail: "not_found" });
});

function updateCookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const content = pair.slice(separator + 1);
    if (content) cookies.set(name, content);
    else cookies.delete(name);
  }
}

async function communityFetch(path, init = {}) {
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const response = await fetch(`${communityOrigin}${path}`, {
    ...init,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) },
    redirect: "manual",
  });
  updateCookies(response);
  return response;
}

async function waitUntilReady(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Community server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${communityOrigin}/api/health`);
      if (response.ok) return;
    } catch {
      // The standalone server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Community server did not become ready");
}

await new Promise((resolve) => cloud.listen(0, host, resolve));
const cloudAddress = cloud.address();
assert.ok(cloudAddress && typeof cloudAddress === "object");
const cloudOrigin = `http://${host}:${cloudAddress.port}`;

const standaloneDirectory = join(process.cwd(), ".next", "standalone");
mkdirSync(join(standaloneDirectory, ".next"), { recursive: true });
cpSync(join(process.cwd(), ".next", "static"), join(standaloneDirectory, ".next", "static"), {
  recursive: true,
});
if (existsSync(join(process.cwd(), "public"))) {
  cpSync(join(process.cwd(), "public"), join(standaloneDirectory, "public"), { recursive: true });
}

const launchOptions = {
  cwd: standaloneDirectory,
  env: {
    ...process.env,
    HOSTNAME: host,
    NC_LOCAL_UPDATE_DIRECTORY: updateDirectory,
    NC_COMMUNITY_STATE_DIRECTORY: join(updateDirectory, "private-state"),
    NC_DEPLOYMENT_ENV: "staging",
    NC_LOCAL_DATA_PILOT_ENABLED: "true",
    PORT: String(communityPort),
    NC_CLOUD_API_BASE_URL: cloudOrigin,
    NC_CLOUD_AUTHORIZATION_URL: `${cloudOrigin}/oauth/authorize`,
    NC_COMMUNITY_CLIENT_ID: "community-smoke-client",
    NC_COMMUNITY_COOKIE_SECURE: "false",
    NC_COMMUNITY_REDIRECT_URI: `${communityOrigin}/api/auth/callback`,
    NC_COMMUNITY_SESSION_SECRET: "community-smoke-session-secret-at-least-32-chars",
  },
  stdio: ["ignore", "pipe", "pipe"],
};

let serverOutput = "";
function launch() {
  const child = spawn(process.execPath, [join(standaloneDirectory, "server.js")], launchOptions);
  child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  return child;
}
let community = launch();

async function waitForHeartbeat(previous) {
  for (let i = 0; i < 160 && heartbeats <= previous; i++) await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(heartbeats > previous, "server must report availability without browser requests");
}

async function waitForRelay(previous) {
  for (let i = 0; i < 160 && relayReads <= previous; i++) {
    if (community.exitCode !== null) throw new Error(`Community server exited with ${community.exitCode}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(relayReads > previous, "outgoing client must serve a Cloud read without a browser or incoming network connection");
}

async function localDataFetch(role, input) {
  const path = role === "write" ? "/api/local-data/v1/records" : "/api/local-data/v1/read";
  const body = JSON.stringify(input), timestamp = String(Date.now()), nonce = randomBytes(16).toString("hex");
  const secret = role === "write" ? localKeys.ingestionKey : localKeys.readKey;
  return fetch(`${communityOrigin}${path}`, { method: "POST", body, headers: {
    "Content-Type": "application/json", "X-NC-Data-Time": timestamp, "X-NC-Data-Nonce": nonce,
    "X-NC-Data-Signature": signLocalRequest(secret, "POST", path, timestamp, nonce, body),
  } });
}

try {
  await waitUntilReady(community);

  const inserted = await localDataFetch("write", { kind: "cart", sourceId: "synthetic-cart", revision: 1,
    observedAt: new Date().toISOString(), operation: "upsert", payload: { email: "private-smoke@example.invalid", status: "abandoned" } });
  assert.equal(inserted.status, 200);
  const { reference } = await inserted.json();
  relayReference = reference;
  const localRead = { kind: "cart", reference, minimumRevision: 1 };
  assert.equal((await localDataFetch("read", localRead)).status, 200);

  const anonymous = await fetch(`${communityOrigin}/api/cloud/capabilities`);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).detail, "community_not_connected");
  assert.equal((await fetch(`${communityOrigin}/api/cloud/recent-emails?shop_uuid=33333333-3333-4333-8333-333333333333`)).status,401);
  assert.equal((await fetch(`${communityOrigin}/api/cloud/journey-audit?shop_uuid=33333333-3333-4333-8333-333333333333`)).status,401);
  assert.equal((await fetch(`${communityOrigin}/api/local-update`)).status, 401);
  assert.equal((await fetch(`${communityOrigin}/api/local-update`, { method: "POST", headers: { Origin: communityOrigin } })).status, 401);

  const start = await communityFetch("/api/auth/start");
  assert.equal(start.status, 307);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.origin, cloudOrigin);
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("client_id"), "community-smoke-client");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("code_challenge"));
  assert.ok(authorization.searchParams.get("scope").split(" ").includes("billing:write"));
  const state = authorization.searchParams.get("state");
  assert.ok(state);
  assert.ok(cookies.has("nc_community_oauth_state"));
  assert.ok(cookies.has("nc_community_pkce_verifier"));

  const callback = await communityFetch(
    `/api/auth/callback?code=smoke-authorization-code&state=${encodeURIComponent(state)}`,
  );
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get("location")).searchParams.get("connected"), "1");
  assert.ok(cookies.has("nc_community_session"));

  const concurrentRefresh = await Promise.all([
    communityFetch("/api/cloud/capabilities"),
    communityFetch("/api/cloud/shops"),
  ]);
  assert.deepEqual(concurrentRefresh.map((response) => response.status), [200, 200]);
  assert.equal(refreshRequests, 1, "concurrent requests must share one refresh-token rotation");

  const emailPath='/api/cloud/recent-emails?shop_uuid=33333333-3333-4333-8333-333333333333';
  const emails=await communityFetch(emailPath);assert.equal(emails.status,200);
  assert.match(emails.headers.get('cache-control'),/no-store/);
  const copies=await emails.json();assert.equal(copies.items.length,1);
  assert.equal(copies.items[0].body_html,'<p>PRIVATE ARCHIVED ORIGINAL</p>');
  assert.equal(copies.items[0].preview_available,true);
  assert.equal(JSON.stringify(copies).includes('community-edge-2'),false);
  assert.equal((await communityFetch('/api/cloud/recent-emails?shop_uuid=44444444-4444-4444-8444-444444444444')).status,403);
  failureMode='archive-shop';
  assert.equal(JSON.stringify(await (await communityFetch(emailPath)).json()).includes('PRIVATE ARCHIVED ORIGINAL'),false);
  failureMode='';

  const journeyAudit = await communityFetch("/api/cloud/journey-audit?shop_uuid=33333333-3333-4333-8333-333333333333&days=30&limit=10&session_page=1&session_filter=cart");
  assert.equal(journeyAudit.status, 200);
  assert.equal((await journeyAudit.json()).event_summary.cart_snapshots, 1);

  const mutationHeaders = { Origin: communityOrigin, "Content-Type": "application/json" };
  const billingRequests = [
    ["/api/cloud/subscription/select-plan", { plan_code: "starter" }, "plan_code", "starter"],
    ["/api/cloud/subscription/checkout", { billing_cycle: "annual", intent_id: "12345678-1234-4234-8234-123456789abc" }, "checkout_url", "https://checkout.stripe.example/session"],
    ["/api/cloud/subscription/confirm", { session_id: "cs_smoke_session_12345678" }, "confirmed", true],
    ["/api/cloud/subscription/upgrade", { billing_cycle: "monthly" }, "portal_url", "https://billing.stripe.example/upgrade"],
    ["/api/cloud/subscription/portal", {}, "portal_url", "https://billing.stripe.example/portal"],
  ];
  for (const [path, body, key, expected] of billingRequests) {
    const billingResponse = await communityFetch(path, { method: "POST", headers: mutationHeaders, body: JSON.stringify(body) });
    assert.equal(billingResponse.status, 200);
    assert.equal((await billingResponse.json())[key], expected);
  }
  for (const [path, body] of [
    ["/api/cloud/subscription/select-plan", { plan_code: "starter" }],
    ["/api/cloud/subscription/checkout", { billing_cycle: "annual", intent_id: "12345678-1234-4234-8234-123456789abc" }],
    ["/api/cloud/subscription/confirm", { session_id: "cs_smoke_session_12345678" }],
    ["/api/cloud/subscription/upgrade", { billing_cycle: "monthly" }],
    ["/api/cloud/subscription/portal", {}],
  ]) {
    const foreignMutation = await communityFetch(path, {
      method: "POST",
      headers: { Origin: "https://foreign.invalid", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(foreignMutation.status, 403, `${path} must reject a foreign origin`);
  }
  const invalidCheckout = await communityFetch("/api/cloud/subscription/checkout", {
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ billing_cycle: "weekly" }),
  });
  assert.equal(invalidCheckout.status, 400);

  await waitForHeartbeat(0);
  await waitForRelay(0);
  assert.equal(signalBatches, 1, "opaque local signals must reach Cloud once");
  const relayBeforeRestart = relayReads;
  const beforeRestart = heartbeats;
  const stopped = new Promise(resolve => community.once("exit", resolve));
  community.kill("SIGTERM");
  await stopped;
  community = launch();
  await waitUntilReady(community);
  await waitForHeartbeat(beforeRestart);
  await waitForRelay(relayBeforeRestart);
  assert.ok(!serverOutput.includes(relayToken));
  assert.ok(!serverOutput.includes(availabilityToken));
  const restored = await localDataFetch("read", localRead);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).payload.status, "abandoned");
  for (const sensitive of [localKeys.encryptionKey, localKeys.ingestionKey, localKeys.readKey, "private-smoke@example.invalid"]) assert.ok(!serverOutput.includes(sensitive));

  const capabilities = await communityFetch("/api/cloud/capabilities");
  assert.equal(capabilities.status, 200);
  assert.equal((await capabilities.json()).quotas.email.limit, 100);
  writeFileSync(join(updateDirectory, "status.json"), JSON.stringify({ phase: "complete" }));
  assert.equal((await (await communityFetch("/api/local-update")).json()).phase, "idle");
  writeFileSync(join(updateDirectory, "status.json"), JSON.stringify({ phase: "complete", version: packageVersion }));
  assert.equal((await (await communityFetch("/api/local-update")).json()).phase, "idle");
  writeFileSync(join(updateDirectory, "target.json"), JSON.stringify({ version: "99.0.0" }));
  writeFileSync(join(updateDirectory, "status.json"), JSON.stringify({ phase: "complete" }));
  assert.equal((await (await communityFetch("/api/local-update")).json()).phase, "idle");
  writeFileSync(join(updateDirectory, "status.json"), JSON.stringify({ phase: "failed" }));
  assert.equal((await (await communityFetch("/api/local-update")).json()).phase, "failed");
  writeFileSync(join(updateDirectory, "status.json"), JSON.stringify({ phase: "failed", version: "99.0.0" }));
  assert.equal((await (await communityFetch("/api/local-update")).json()).phase, "failed");
  for (const origin of ["null", "https://foreign.invalid"]) {
    assert.equal((await communityFetch("/api/local-update", { method: "POST", headers: { Origin: origin } })).status, 403);
  }
  targetBlocked = true;
  assert.equal((await communityFetch("/api/local-update", { method: "POST", headers: { Origin: communityOrigin } })).status, 409);
  targetBlocked = false;
  assert.equal((await communityFetch("/api/local-update", { method: "POST", headers: { Origin: communityOrigin }, body: JSON.stringify({ version: "evil", command: "echo unsafe" }) })).status, 202);
  assert.deepEqual(JSON.parse(readFileSync(join(updateDirectory, "request.json"), "utf8")), { version: "99.0.0" });
  assert.equal((await communityFetch("/api/local-update", { method: "POST", headers: { Origin: communityOrigin } })).status, 409);
  const queuedUpdate = await (await communityFetch("/api/local-update")).json();
  assert.equal(queuedUpdate.phase, "queued");
  assert.equal(queuedUpdate.version, "99.0.0");
  unlinkSync(join(updateDirectory, "request.json"));

  const shops = await communityFetch("/api/cloud/shops");
  assert.equal(shops.status, 200);
  assert.equal((await shops.json()).items[0].shop_id, "shop_smoke");

  const createShop = await communityFetch("/api/cloud/shops", { method: "POST" });
  assert.equal(createShop.status, 405);

  const readPath = "/api/cloud/notifications/smoke/read";
  for (const headers of [{}, { Origin: "null" }, { Origin: "https://foreign.invalid" }]) {
    const rejected = await communityFetch(readPath, { method: "POST", headers });
    assert.equal(rejected.status, 403);
  }
  assert.equal(mutations, 0);
  const accepted = await communityFetch(readPath, { method: "POST", headers: { Origin: communityOrigin } });
  assert.equal(accepted.status, 200);
  assert.equal(mutations, 1);
  const session = cookies.get("nc_community_session");
  const logout = await communityFetch("/api/auth/logout", { method: "POST", headers: { Origin: "https://foreign.invalid" } });
  assert.equal(logout.status, 403);
  assert.equal(cookies.get("nc_community_session"), session);

  failureMode = "transport";
  const unavailable = await communityFetch("/api/cloud/capabilities");
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).detail, "cloud_unavailable");
  assert.equal(cookies.get("nc_community_session"), session);

  failureMode = "token";
  const failedStart = await communityFetch("/api/auth/start");
  const failedState = new URL(failedStart.headers.get("location")).searchParams.get("state");
  const failedCallback = await communityFetch(
    `/api/auth/callback?code=smoke-authorization-code&state=${encodeURIComponent(failedState)}`,
  );
  assert.equal(new URL(failedCallback.headers.get("location")).searchParams.get("auth_error"), "oauth_exchange_failed");
  assert.ok(!failedCallback.headers.get("location").includes("synthetic-private-diagnostic"));

  assert.deepEqual(observed, {
    tokenExchange: true,
    capabilities: true,
    shopList: true,
    planSelection: true,
    checkout: true,
    checkoutConfirmation: true,
    upgrade: true,
    billingPortal: true,
  });
  console.log("OAuth, billing return, proxy, origin checks, persistent heartbeat and encrypted local-data API/restart smoke test passed.");
} catch (error) {
  if (serverOutput) process.stderr.write(serverOutput);
  throw error;
} finally {
  community.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => community.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  await new Promise((resolve) => cloud.close(resolve));
  rmSync(updateDirectory, { recursive: true, force: true });
}
