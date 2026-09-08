import assert from "node:assert/strict";
import { validVersion, verifySigner, verifyCheckout, FINGERPRINT } from "./verified-update.mjs";
import { activateCandidate } from "./update-switch.mjs";

for (const bad of [undefined, {}, "../main", "1.2.3;id", "1.2.3\n", "--upload-pack=evil", "v1.2.3", "https://example.com"]) assert.equal(validVersion(bad), false);
assert.equal(validVersion("0.1.0-preview.4"), true);
const signature = `[GNUPG:] VALIDSIG ${FINGERPRINT} 2026-09-08 1 0 4 0 22 8 00 ${FINGERPRINT}`;
verifySigner(signature);
verifyCheckout("a".repeat(40) + "\n", "a".repeat(40));
assert.throws(() => verifyCheckout("b".repeat(40), "a".repeat(40)));
for (const bad of ["", signature.replaceAll(FINGERPRINT, "A".repeat(40)), signature + "\n[GNUPG:] REVKEYSIG abc", signature + "\n" + signature]) assert.throws(() => verifySigner(bad));

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
