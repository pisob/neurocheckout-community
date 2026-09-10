import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "./env-file.mjs";
import {
  createSessionSecret,
  cloudConfiguration,
  isPlaceholder,
  renderConfiguration,
  validateClientId,
  validateRedirectUri,
} from "./setup-community.mjs";

assert.equal(validateClientId("nc_public_test_123"), "nc_public_test_123");
assert.throws(() => validateClientId("nc_replace_with_your_public_client_id"));
assert.equal(
  validateRedirectUri("http://localhost:3400/api/auth/callback"),
  "http://localhost:3400/api/auth/callback",
);
assert.equal(
  validateRedirectUri("https://community.example.com/api/auth/callback"),
  "https://community.example.com/api/auth/callback",
);
assert.throws(() =>
  validateRedirectUri("http://community.example.com/api/auth/callback"),
);
assert.throws(() => validateRedirectUri("https://community.example.com/callback"));
assert.equal(isPlaceholder("replace-with-a-secret"), true);

const sessionSecret = createSessionSecret();
assert.ok(sessionSecret.length >= 32);
const rendered = renderConfiguration({
  clientId: "nc_public_test_123",
  redirectUri: "http://localhost:3400/api/auth/callback",
  cloudApiBaseUrl: "https://www.neurocheckout.com",
  cloudAuthorizationUrl: "https://www.neurocheckout.com/community/authorize",
  cloudUpgradeUrl: "https://www.neurocheckout.com/pricing",
  sessionSecret,
  cookieSecure: false,
});
const parsed = parseEnvironment(rendered);
assert.equal(parsed.NC_COMMUNITY_CLIENT_ID, "nc_public_test_123");
assert.equal(parsed.NC_COMMUNITY_SESSION_SECRET, sessionSecret);
assert.equal(parsed.NC_COMMUNITY_COOKIE_SECURE, "false");
assert.equal(parsed.NC_LOCAL_DATA_PILOT_ENABLED, "false");
assert.equal(parsed.NC_CONNECTOR_PULL_ENABLED, "false");
const staging = cloudConfiguration("staging", { NC_CLOUD_API_BASE_URL: "https://www.neurocheckout.com" });
assert.equal(staging.cloudApiBaseUrl, "https://community-api-staging.neurocheckout.com");
assert.equal(staging.cloudAuthorizationUrl, "https://staging.neurocheckout.com/community/authorize");
assert.equal(staging.deploymentEnvironment, "staging");
assert.equal(cloudConfiguration().cloudApiBaseUrl, "https://www.neurocheckout.com");
assert.equal(cloudConfiguration("production", { NC_CLOUD_API_BASE_URL: staging.cloudApiBaseUrl }).cloudApiBaseUrl, "https://www.neurocheckout.com");
assert.throws(() => cloudConfiguration("invalid"));
assert.equal(parseEnvironment(renderConfiguration({ ...staging, clientId: "nc_public_test_123", redirectUri: "http://localhost:3400/api/auth/callback", sessionSecret, cookieSecure: false })).NC_DEPLOYMENT_ENV, "staging");

const setupTestDirectory = mkdtempSync(join(tmpdir(), "nc-native-staging-setup-"));
try {
  const output = join(setupTestDirectory, ".env.local");
  execFileSync(process.execPath, [fileURLToPath(new URL("./setup-community.mjs", import.meta.url)),
    "--environment=staging", "--client-id=nc_public_synthetic_test", `--output=${output}`]);
  const configured = parseEnvironment(readFileSync(output, "utf8"));
  assert.equal(configured.NC_CLOUD_API_BASE_URL, staging.cloudApiBaseUrl);
  assert.equal(configured.NC_CLOUD_AUTHORIZATION_URL, staging.cloudAuthorizationUrl);
  assert.equal(configured.NC_DEPLOYMENT_ENV, "staging");
  assert.equal(configured.NC_COMMUNITY_REDIRECT_URI, "http://localhost:3400/api/auth/callback");
  assert.equal(configured.NC_LOCAL_DATA_PILOT_ENABLED, "false");
  assert.equal(configured.NC_CONNECTOR_PULL_ENABLED, "false");
  assert.equal(statSync(output).mode & 0o777, 0o600);
} finally {
  rmSync(setupTestDirectory, { recursive: true, force: true });
}

console.log("Native setup and environment tests passed.");
