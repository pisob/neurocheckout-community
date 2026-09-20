# NeuroCheckout Community v0.1.0-preview.14

Official signed prerelease extending operational evidence in Community and
protecting secure updates from version downgrades.

## Operational evidence

- Agent performance now shows both **Open rate** and **Click rate** using the
  same owner-scoped Cloud analytics source.
- The new **Journey audit** workspace shows funnel signals, prioritized
  customer journeys, cart value, outcomes and recent audit snapshots for the
  selected store and period.
- Journey data is scoped to the connected store. Raw names, emails, tokens,
  cookies and session identifiers are not exposed in Community.
- **Internal messages** now uses the same Cloud member-notification service as
  the hosted dashboard and includes the matching welcome guidance in English
  and French.

## Secure updates

- The secure updater now installs a release only when its complete semantic
  version is strictly newer than the currently running version.
- Numeric preview identifiers are ordered correctly, so `preview.13` is newer
  than `preview.10`.
- A stale or incorrectly configured Cloud update target is rejected before it
  is downloaded, built or activated.
- Configuration, encryption keys, the local vault and archived sent-email
  previews remain untouched when a target is rejected.

This release includes the sent-email preview features from `preview.13`:

- Browse the last ten confirmed sent emails in a responsive English/French
  inspector, with an accessible full-size preview.
- Original email copies are encrypted in your Community vault, scoped to your
  store, and retained for up to 30 days. Cloud archival support is required for
  new copies; messages without a local copy show metadata only.
- When NeuroCheckout Cloud already has the sent email HTML/text, Community now
  preserves that preview instead of marking the original content as unavailable.
- HTTPS raster product and recommendation images are displayed. Tracking pixels,
  scripts and automatic navigation remain blocked inside previews.
- Choose **Open original cart link** to open the recovery CTA in a new tab.
  This deliberate action may count as an email click.
- Cached email images use the connected Cloud API origin.
- Agents, scheduling, quotas and email delivery remain in NeuroCheckout Cloud.
- Upgrade in place using the signed updater. Keep your configuration, local
  vault and encryption keys; do not uninstall or delete them to update.
- This release does not reconstruct historical emails or add customer tracking
  and conversion attribution to delivery paths that do not already support them.
- Historical copies retain their original URLs; expired recovery links are not
  renewed by updating Community.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
