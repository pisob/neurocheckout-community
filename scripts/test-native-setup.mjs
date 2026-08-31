import assert from "node:assert/strict";

import { parseEnvironment } from "./env-file.mjs";
import {
  createSessionSecret,
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

console.log("Native setup and environment tests passed.");
