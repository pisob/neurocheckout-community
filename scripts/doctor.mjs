import { existsSync } from "node:fs";

import { loadEnvironmentFile } from "./env-file.mjs";
import {
  isLoopbackHostname,
  isPlaceholder,
  validateClientId,
  validateRedirectUri,
} from "./setup-community.mjs";

loadEnvironmentFile(".env.local");

const passed = [];
const warnings = [];
const failures = [];

function pass(message) {
  passed.push(message);
}

function fail(message) {
  failures.push(message);
}

function validateServiceUrl(name, value) {
  try {
    const url = new URL(String(value || ""));
    const localHttp =
      url.protocol === "http:" && isLoopbackHostname(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      throw new Error("HTTPS is required outside localhost");
    }
    pass(`${name} is valid`);
    return url;
  } catch (error) {
    fail(`${name}: ${error.message}`);
    return null;
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 22) pass(`Node.js ${process.versions.node}`);
else fail(`Node.js 22 or newer is required; found ${process.versions.node}`);

try {
  validateClientId(process.env.NC_COMMUNITY_CLIENT_ID);
  pass("public Cloud client ID is configured");
} catch (error) {
  fail(error.message);
}

let redirect = null;
try {
  redirect = new URL(validateRedirectUri(process.env.NC_COMMUNITY_REDIRECT_URI));
  pass("OAuth callback is valid");
} catch (error) {
  fail(error.message);
}

const secret = String(process.env.NC_COMMUNITY_SESSION_SECRET || "");
if (secret.length >= 32 && !isPlaceholder(secret)) {
  pass("session secret is configured");
} else {
  fail("The session secret must contain at least 32 non-placeholder characters.");
}

if (redirect) {
  const secure = String(process.env.NC_COMMUNITY_COOKIE_SECURE || "") === "true";
  if (redirect.protocol === "https:" && !secure) {
    fail("NC_COMMUNITY_COOKIE_SECURE must be true for an HTTPS callback.");
  } else if (redirect.protocol === "http:" && secure) {
    fail("NC_COMMUNITY_COOKIE_SECURE must be false for local HTTP.");
  } else {
    pass("cookie security matches the callback protocol");
  }
}

const cloudBase = validateServiceUrl(
  "Cloud API URL",
  process.env.NC_CLOUD_API_BASE_URL,
);
validateServiceUrl(
  "Cloud authorization URL",
  process.env.NC_CLOUD_AUTHORIZATION_URL,
);
validateServiceUrl("Cloud upgrade URL", process.env.NC_CLOUD_UPGRADE_URL);

if (!existsSync(".next/standalone/server.js")) {
  warnings.push("Production build is absent; run npm run build before npm start.");
} else {
  pass("production build is present");
}

if (cloudBase && process.env.NC_DOCTOR_SKIP_NETWORK !== "true") {
  try {
    const endpoint = new URL("/api/v1/member/capabilities", cloudBase);
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if ([200, 401, 403].includes(response.status)) {
      pass(`NeuroCheckout Cloud is reachable (HTTP ${response.status})`);
    } else {
      fail(`Unexpected Cloud response: HTTP ${response.status}`);
    }
  } catch (error) {
    fail(`NeuroCheckout Cloud is unreachable: ${error.message}`);
  }
}

for (const message of passed) console.log(`✓ ${message}`);
for (const message of warnings) console.log(`! ${message}`);
for (const message of failures) console.error(`✗ ${message}`);

if (failures.length) {
  console.error(`Doctor found ${failures.length} blocking problem(s).`);
  process.exitCode = 1;
} else {
  console.log("NeuroCheckout Community is ready to connect to Cloud.");
}
