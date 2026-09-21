# NeuroCheckout Community v0.1.0-preview.16

Official signed prerelease adding subscription continuity to the self-hosted
Community interface.

## Plans and billing

- Community remains the self-hosted interface when an account activates
  Starter or Pro.
- The new **Plan & data** workspace starts secure checkout, opens billing
  management and refreshes Cloud-calculated entitlements.
- Checkout returns only to the OAuth-registered Community origin and uses the
  dedicated `billing:write` permission.
- Durable checkout intents and server-side reservations prevent duplicate
  subscriptions across retries, tabs and ambiguous Stripe responses.
- Checkout confirmation retries safely without losing the recovery URL.

## Continuity and security

- Plan changes, cancellation, payment grace and suspension preserve the
  encrypted local vault, configuration, connector settings and backups.
- Suspended or expired accounts retain only the narrowly scoped billing routes
  required to recover access; business features remain denied until Cloud
  reactivates them.
- All subscription mutations reject foreign origins. Return URLs are derived
  from the configured OAuth callback rather than browser input.
- Concurrent dashboard calls share refresh-token rotation, preventing false
  disconnections while keeping Cloud authoritative.
- Unknown or incomplete entitlement manifests fail closed.

## Data protection and usage clarity

- The plan workspace presents a public-safe protection summary without exposing
  internal service names, architecture details or raw identifiers.
- Unknown feature identifiers and service errors fail closed to approved,
  user-facing copy.
- Paid-plan email usage comes from the authoritative Cloud quota gate and no
  longer treats temporarily unknown usage as zero.
- Entitlements refresh after billing returns, periodically and whenever the
  browser becomes active, with a visible delayed-sync state.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
