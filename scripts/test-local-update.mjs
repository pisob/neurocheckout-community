import assert from "node:assert/strict";
import { compareVersions, fetchReleaseAsset, isNewerVersion, releaseAssetUrl, validVersion, verifySigner, verifyCheckout, FINGERPRINT } from "./verified-update.mjs";
import { activateCandidate } from "./update-switch.mjs";

for (const bad of [undefined, {}, "../main", "1.2.3;id", "1.2.3\n", "--upload-pack=evil", "v1.2.3", "https://example.com"]) assert.equal(validVersion(bad), false);
assert.equal(validVersion("0.1.0-preview.4"), true);
assert.equal(compareVersions("0.1.0-preview.10", "0.1.0-preview.13"), -1);
assert.equal(compareVersions("0.1.0-preview.13", "0.1.0-preview.10"), 1);
assert.equal(compareVersions("0.1.0-preview.13", "0.1.0-preview.13"), 0);
assert.equal(compareVersions("0.1.0-preview.13", "0.1.0"), -1);
assert.equal(isNewerVersion("0.1.0-preview.14", "0.1.0-preview.13"), true);
assert.equal(isNewerVersion("0.1.0-preview.10", "0.1.0-preview.13"), false);
assert.equal(isNewerVersion("0.1.0-preview.13", "0.1.0-preview.13"), false);
const signature = `[GNUPG:] VALIDSIG ${FINGERPRINT} 2026-09-08 1 0 4 0 22 8 00 ${FINGERPRINT}`;
verifySigner(signature);
verifyCheckout("a".repeat(40) + "\n", "a".repeat(40));
assert.throws(() => verifyCheckout("b".repeat(40), "a".repeat(40)));
for (const bad of ["", signature.replaceAll(FINGERPRINT, "A".repeat(40)), signature + "\n[GNUPG:] REVKEYSIG abc", signature + "\n" + signature]) assert.throws(() => verifySigner(bad));

const assetName = "neurocheckout-community-0.1.0-preview.17.tar.gz";
const assetUrl = releaseAssetUrl("0.1.0-preview.17", assetName);
assert.equal(assetUrl, `https://github.com/pisob/neurocheckout-community/releases/download/v0.1.0-preview.17/${assetName}`);
assert.equal(new URL(assetUrl).hostname, "github.com");
assert.throws(() => releaseAssetUrl("../main", assetName));
assert.throws(() => releaseAssetUrl("0.1.0-preview.17", "unexpected.tar.gz"));

let attempts = 0;
const recoveredAsset = await fetchReleaseAsset(assetUrl, {
  retryDelays: [0],
  fetchImpl: async () => {
    attempts += 1;
    return attempts === 1 ? new Response("limited", { status: 429 }) : new Response("signed release");
  },
});
assert.equal(attempts, 2);
assert.equal(recoveredAsset.toString("utf8"), "signed release");
await assert.rejects(fetchReleaseAsset(assetUrl, {
  retryDelays: [0, 0],
  fetchImpl: async () => new Response("missing", { status: 404 }),
}), /asset_missing/);
await assert.rejects(fetchReleaseAsset(assetUrl, {
  retryDelays: [],
  maximumBytes: 4,
  fetchImpl: async () => new Response("oversized"),
}), /asset_too_large/);

for (const scenario of ["success", "unhealthy", "start_failure", "commit_failure"]) {
  const events = [];
  let selected = "old";
  const result = await activateCandidate("new", "old", {
    stop: async () => events.push("stop"),
    start: async value => { events.push(value); selected = value; if (scenario === "start_failure" && value === "new") throw new Error(); },
    healthy: async () => scenario !== "unhealthy" || selected === "old",
    commit: async value => { if (scenario === "commit_failure") throw new Error(); events.push("commit:" + value); },
  });
  assert.equal(result.current, scenario === "success" ? "new" : "old");
  assert.equal(result.phase, scenario === "success" ? "complete" : "rolled_back");
  if (scenario !== "success") assert.equal(events.includes("commit:new"), false);
}
await assert.rejects(activateCandidate("new", "old", { stop: async () => {}, start: async () => {}, healthy: async () => false, commit: async () => {} }), /rollback_unhealthy/);
console.log("Update input validation, signer rejection and activation rollback tests passed.");
