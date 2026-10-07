# Release channels and stable acceptance

## Current status / Statut actuel

Community is still a **prerelease**, including when connected to production.
Production connectivity is not a stable certification. No stable version is
declared by this hardening work. The full merchant acceptance journey is pending
the owner's validation; it must not be marked passed by CI alone.

Community reste une **préversion**, même connectée à la production. Le parcours
marchand complet reste à valider par le propriétaire avant toute version stable.

## Required acceptance criteria

1. Public homepage, navigation, footer and production guide pass FR/EN mobile and
   desktop checks. Community links navigate correctly; no staging setup commands.
2. Signed update validation passes, the old application stays available during
   preparation, an unhealthy candidate rolls back, and a protected multi-store
   backup can actually be restored. The previous version can still read the vault.
3. Diagnostics distinguish unavailable evidence, stale source, refused credentials,
   invalid signatures and pending work without exposing secrets or asserting cron
   is stopped merely because events are missing.
4. Official tag/archive signature and checksums are verified. Installation and
   recovery instructions match the candidate, including launcher upgrades.
5. CI, typecheck, production build and dependency security checks pass. No unresolved
   release-blocking security, data-loss or duplicate-send issue remains.
6. **Owner's merchant journey (pending):** install, connect each supported store,
   verify initial and recurring order history, receive a cart, validate the email
   language/content, send to an authorized test recipient, follow the CTA and verify
   recovery/conversion and no duplicate send. Include multi-store isolation.

Do not use real customer data in a public issue. Keep detailed evidence private;
public release notes describe user-visible changes and known limitations only.

## Maintainer stable gate

## Hardening verification (candidate)

Local verification of this change: production build and TypeScript; signed-update
input checks and launcher startup recovery; private multi-store backup/restore;
unhealthy-candidate HTTP rollback with retained vault/config; source authentication
and signature failure/recovery; workspace and encrypted local-data isolation;
FR/EN diagnostic mappings and browser refresh failure; native setup and relay;
existing guided setup, plan actions and email preview browser journeys.
The production dependency audit reported no known vulnerabilities at verification.
This is not merchant acceptance and does not declare the candidate released.

### Stable attestation

The signing builder refuses a stable tag unless `NC_STABLE_READINESS_FILE` points
to a private JSON attestation for that tag's exact Git tree and package version.
The existing GitHub publishing workflow remains **preview-only**; a stable
publishing workflow requires a separate reviewed change after acceptance.

Evidence format (replace pending entries only after verification):

```json
{
  "schema": 1,
  "version": "0.1.0",
  "source_tree": "GIT_TREE_OF_THE_CANDIDATE",
  "blockers": [],
  "checks": {
    "frontoffice_regression": {"status": "pending"},
    "update_rollback_restore": {"status": "pending"},
    "diagnostics": {"status": "pending"},
    "signed_distribution": {"status": "pending"},
    "security_audit": {"status": "pending"},
    "merchant_journey": {"status": "pending"}
  }
}
```

Each passed entry requires `evidence`, `reviewed_by` and an ISO `checked_at` date.
Run `node scripts/release-readiness.mjs TAG PRIVATE_EVIDENCE_JSON` before signing.
An attestation records accountable review; it cannot replace the actual tests.
Changing candidate sources invalidates the previous tree-bound attestation.
