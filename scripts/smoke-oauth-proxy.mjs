import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const host = "127.0.0.1";
const communityPort = 43118;
const communityOrigin = `http://${host}:${communityPort}`;
const cookies = new Map();
const observed = {
  tokenExchange: false,
  capabilities: false,
  shopCreation: false,
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
    assert.equal(body.grant_type, "authorization_code");
    assert.equal(body.client_id, "community-smoke-client");
    assert.equal(body.code, "smoke-authorization-code");
    assert.equal(body.redirect_uri, `${communityOrigin}/api/auth/callback`);
    assert.ok(body.code_verifier.length >= 43);
    observed.tokenExchange = true;
    return json(response, 200, {
      access_token: "smoke-access-token",
      refresh_token: "smoke-refresh-token",
      expires_in: 900,
      scope: "openid capabilities:read shops:write",
    });
  }

  assert.equal(request.headers.authorization, "Bearer smoke-access-token");
  assert.equal(request.headers["x-neurocheckout-community-version"], "0.1.0-preview.1");

  if (request.method === "GET" && request.url === "/api/v1/member/capabilities") {
    observed.capabilities = true;
    return json(response, 200, {
      plan: { code: "community" },
      quotas: { email: { limit: 100, window: "rolling_24h" } },
    });
  }

  if (request.method === "POST" && request.url === "/api/v1/member/shops/create") {
    const body = JSON.parse(await requestBody(request));
    assert.deepEqual(body, { name: "Smoke Shop", platform: "woocommerce" });
    observed.shopCreation = true;
    return json(response, 201, { id: "shop_smoke", ...body });
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

const community = spawn(process.execPath, [join(standaloneDirectory, "server.js")], {
  cwd: standaloneDirectory,
  env: {
    ...process.env,
    HOSTNAME: host,
    PORT: String(communityPort),
    NC_CLOUD_API_BASE_URL: cloudOrigin,
    NC_CLOUD_AUTHORIZATION_URL: `${cloudOrigin}/oauth/authorize`,
    NC_COMMUNITY_CLIENT_ID: "community-smoke-client",
    NC_COMMUNITY_COOKIE_SECURE: "false",
    NC_COMMUNITY_REDIRECT_URI: `${communityOrigin}/api/auth/callback`,
    NC_COMMUNITY_SESSION_SECRET: "community-smoke-session-secret-at-least-32-chars",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
community.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
community.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitUntilReady(community);

  const anonymous = await fetch(`${communityOrigin}/api/cloud/capabilities`);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).detail, "community_not_connected");

  const start = await communityFetch("/api/auth/start");
  assert.equal(start.status, 307);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.origin, cloudOrigin);
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("client_id"), "community-smoke-client");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("code_challenge"));
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

  const capabilities = await communityFetch("/api/cloud/capabilities");
  assert.equal(capabilities.status, 200);
  assert.equal((await capabilities.json()).quotas.email.limit, 100);

  const shop = await communityFetch("/api/cloud/shops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Smoke Shop", platform: "woocommerce" }),
  });
  assert.equal(shop.status, 201);
  assert.equal((await shop.json()).id, "shop_smoke");

  assert.deepEqual(observed, {
    tokenExchange: true,
    capabilities: true,
    shopCreation: true,
  });
  console.log("OAuth PKCE, encrypted session and Cloud proxy smoke test passed.");
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
}
