# NeuroCheckout Community v0.1.0-preview.5

Official signed **staging prerelease**, not approved for production.

- Persistent availability client, encrypted local product/cart vault, signed
  source synchronization and outbound-only Cloud read transport are included.
- Agents, scheduling, quotas and email delivery remain in NeuroCheckout Cloud.
- Setup now supports `npm run setup -- --environment=staging`. Follow the README
  to verify the signed tag, register/reuse a staging Client ID and install.
- The new local-data/source-pull components remain disabled. Business-complete
  connector exports, real-store validation, minimized events and all Cloud
  business readers are still pending. No existing Cloud data is migrated/deleted.
- The test-store abandoned-cart scenario uses the existing Cloud pipeline and
  staging Mailpit. A successful test does not certify the local-data migration.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
No production deployment or released commerce connector is included.
