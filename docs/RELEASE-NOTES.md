# NeuroCheckout Community v0.1.0-preview.15

Official signed prerelease adding end-to-end synchronization diagnostics and
durable email-delivery evidence to NeuroCheckout Community.

## Synchronization reliability

- The new **Synchronization health** workspace follows the active store from
  its connector and encrypted local vault through Cloud reconciliation and
  delivery evidence.
- Connector freshness, the latest received and processed signals, local events
  awaiting acknowledgement, Cloud queue activity, incomplete records and
  failed records are visible without exposing raw cart or customer data.
- Temporary network or Cloud failures are retried automatically. The manual
  **Retry synchronization** action safely wakes the same idempotent loops and
  does not duplicate acknowledged events or bypass validation.
- The dashboard refreshes synchronization health automatically every 15 seconds
  and surfaces the latest actionable diagnostic.

## Email evidence and quotas

- Browse, filter and paginate up to 50 recent delivery records using **All**,
  **Sent**, **Delivered**, **Opened**, **Clicked**, **Converted** and **Bounced**.
- Converted-email evidence remains visible through its own filter and permanent
  status count even after it leaves the latest-ten preview window.
- The latest ten original email copies remain encrypted in the local vault and
  can display their preserved HTML or text preview when available.
- Email usage now explains the rolling quota and shows when the next individual
  capacity unit becomes available.

## Existing operational evidence

- Agent performance includes both open and click rates.
- Journey audit provides owner-scoped funnel signals, prioritized journeys,
  cart outcomes and recent audit snapshots.
- Internal messages uses the Cloud member-notification service and synchronizes
  read state.
- Secure updates reject older, equal, unrecognized or blocked versions before
  downloading or changing the installation.
- Upgrade in place using the signed updater. Configuration, encryption keys,
  the local vault and archived email previews are preserved.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
