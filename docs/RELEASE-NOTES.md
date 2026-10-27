# NeuroCheckout Community v0.1.0

- Consolidate encrypted multi-store synchronization, local email originals and
  conversion evidence for the supported PrestaShop, WooCommerce and Magento connectors.
- Preserve configuration during temporary Cloud failures and connector key rotations.
- Retain manual email approvals, per-store isolation and idempotent delivery reconciliation.
- Keep signed updates, protected backups and rollback available from the dashboard.

Publication requires the exact-source acceptance and observation gates in
[STABLE-RELEASE.md](STABLE-RELEASE.md). A candidate branch is not a published release.
Install an official published version with the Update button when ready; no update
or customer campaign is enabled automatically.

# NeuroCheckout Community v0.1.0-preview.55

- Keep temporary Cloud failures separate from expired sign-in: configuration is
  preserved and retries happen automatically without asking you to reconnect.
- Respect the Cloud waiting period when the request limit is reached.
- Explain when a rotated connector key must be copied into the store module,
  instead of claiming synchronization succeeded before the transfer completed.

Update manually with the dashboard Update button when ready. This release does
not install itself, change your plan, reset local data or enable customer emails.
The separate Cloud and WooCommerce fixes protect dashboard read availability and
preserve encrypted source snapshots across connector key rotations.

# NeuroCheckout Community v0.1.0-preview.54

- Fix authorization for paid plan changes when connected to production Cloud.
- Offer a direct reconnect action when an older session lacks billing permission,
  in English and French, before attempting a plan change.
- Preserve the normal plan review and payment confirmation. Reconnecting alone
  never changes the subscription or charges a payment.

Update manually with the dashboard Update button, reconnect once when prompted,
then return to Plan & data and choose your offer. Local data is preserved.

# NeuroCheckout Community v0.1.0-preview.52

## 0.1.0-preview.53 — 2026-10-25

Sponsored campaigns change on each page change or refresh, without immediately
repeating the same campaign when several are available. Background synchronization
does not rotate the banner. Support buttons and free-plan eligibility are unchanged.
Update manually with the dashboard Update button when ready.


- Explain voluntary support above the sidebar button in English and French.
- Display the active sponsored campaign below the language and account header on
  every page, with a compact image that preserves its proportions.

# NeuroCheckout Community v0.1.0-preview.51

- Add a Support Community button at the bottom of the sidebar, available on every
  page even when the menu is collapsed.
- Share the existing verified Stripe flow with Plan & data, including French and
  English labels, test mode and free Community eligibility.

# NeuroCheckout Community v0.1.0-preview.50

- Fold the menu links upward under the Menu button instead of narrowing the sidebar.
- Keep the desktop sidebar width and workspace position unchanged when toggling.
- Start the menu collapsed, with accessible plus/minus controls and reduced-motion support.

This is a signed preview. Install it using Update when ready. Existing configuration,
encrypted data and installation-step controls are preserved.

# NeuroCheckout Community v0.1.0-preview.49

- Start the navigation menu and installation steps collapsed to keep the overview compact.
- Expand or collapse both sections with explicit plus/minus controls in English and French.
- Keep numbered navigation shortcuts on desktop and accessible menu controls on mobile and keyboard.
- Simplify the README around signed installation, setup and daily use.

This is a signed preview. Existing keys, encrypted data, consent and email settings
are preserved. From preview.48, use the dashboard Update button when you choose
to install; publishing this release does not install it on your computer.

# Community preview.46

Completed initial and weekly local order-history imports now send the configured
internal success notification. The receipt shows the original completion time,
next weekly due time and number of imported account histories. Existing complete
preview.45 imports are reported without rerunning them. Partial or failed imports
never report success; duplicate heartbeats and reconnects do not resend a receipt.

Order and customer data remain encrypted locally. This update does not activate
customer email campaigns or change prior legacy Cloud import records.
Completion notifications require compatible NeuroCheckout Cloud services.

# NeuroCheckout Community v0.1.0-preview.44

## Preserve fresh reads during source refresh

- Keep the last complete local snapshot readable while a source request is in
  flight, under its original 60-second freshness limit.
- Continue blocking incomplete, failed, stale or abandoned synchronization.
  Applying a partial page closes reads atomically with the data changes.
- Preserve signed native price, history and account-cart checks, including
  freshness, store/customer binding, credentials and installation identity.
- Cover concurrent SQLite connections, expired leases, partial updates and
  native reads interrupted by a refresh across all three platforms.

No vault migration or new connector release is required. Existing configuration,
keys, consent and email originals are preserved. Updating this signed preview
does not enable campaigns or change recommendation eligibility. Live delivery
acceptance remains separate. Back up the installation and restart the root
launcher following `docs/INSTALLATION.md`.

# NeuroCheckout Community v0.1.0-preview.43

## Coordinated native recommendation contracts

- Relay current account-cart presence for PrestaShop, WooCommerce and Magento.
- Accept signed native history v2 with nullable discounts while retaining v1
  compatibility and strict completeness, identity, size and freshness checks.
- Preserve approved email originals and schema-2 offer evidence in the encrypted
  local vault; existing consent, synchronization and archives are preserved.
- Requires compatible NeuroCheckout Cloud services and connectors PrestaShop
  4.6.11, WooCommerce 1.0.13 and Magento 1.0.10. Updating this dashboard does not
  turn campaigns on.

This is a signed preview, not stable certification. Back up the installation and
follow `docs/INSTALLATION.md`. Native installed-store and email acceptance are
tracked separately from synthetic fixture tests.

# NeuroCheckout Community v0.1.0-preview.42

## Recommendation data and original email history

- Read the complete encrypted local catalog through bounded, consistent pages.
- Relay native account history and recipient-specific prices for PrestaShop, WooCommerce and Magento with matching connectors and Cloud support.
- Preserve signed product facts inside encrypted email originals, including backup and restart, so Cloud can avoid repeated recommendations.
- Keep exact original previews and approvals bound to their store, installation and delivery. Missing originals remain unavailable; retries never rewrite them.
- Preserve existing vaults, consent choices, cart synchronization and delivery history.

Independent recommendation campaigns remain incomplete and are not activated by
this release. Audience/profile completion, scheduling, final sending checks and
conversion attribution remain in progress. This is a signed preview, not stable
certification. Back up the installation and update the root launcher as described
in docs/INSTALLATION.md. Store connectors and Cloud are updated separately.

# NeuroCheckout Community v0.1.0-preview.41

## Source recovery and attribution evidence

- Keep long cart/order references readable on desktop and mobile.
- Distinguish attributed order value from verified payment; show the historical native order status when available. Live refunds and cancellations are not tracked by this view.
- Identify an exhausted ngrok request allowance without misdiagnosing a connector key. Back off source requests for 15 minutes while maintaining Cloud heartbeats and healthy sibling stores; explicit retry remains available.
- Extend regression coverage for isolated source backoff and restored backups that retain the original replay identity.
- Require real automatic journeys, fault/replay tests, quota lifecycle evidence, explicit merchant acceptance and at least 72 hours of exact-candidate observation before a stable release can be signed and published.

This is a validation preview, not a stable certification. Normal-delay merchant
journeys and real mailbox image reception must still be verified on reachable
stores. Updating Community does not update Cloud or store connectors.

# NeuroCheckout Community v0.1.0-preview.40

## Approval preview reliability

- Mount the sandboxed email preview only after the selected original has been sanitized. This avoids the blank initial preview observed in Opera.
- Bind the preview to the selected shop and exact copy; keep approval disabled until that preview loads.
- Use the existing styled store selector in Email approvals.
- Regression coverage checks store switching, exact signatures, tracking removal, and that no empty preview frame is mounted.

# NeuroCheckout Community v0.1.0-preview.39

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Review manual email approvals separately for each authorized store.
- Read exact signed email originals from the encrypted local vault, not Cloud storage.
- Disable approval if the original is missing, changed or belongs to another installation.
- Keep approved emails visible while Cloud delivery waits for the installation.
- Preserve the original subject and content across retries, even if a newly selected template differs.
- Sanitize previews, including images, without following recovery links or loading tracking pixels.
- Preserve existing keys, synchronization, encrypted data and delivery history.

Requires compatible NeuroCheckout Cloud services with manual approvals enabled
for the store. Older clients cannot bypass a store's manual-approval policy.
An approval expires after 18 hours or when the cart revision/authorization changes.
Approval itself consumes no email quota. Cloud rechecks the cart, suppression,
quota and delivery fence before sending; unknown SMTP outcomes are not retried automatically.

Connector version reporting improvements are distributed separately through each
connector's reviewed release; updating Community alone does not update a store module.

Funding is controlled by NeuroCheckout Cloud and remains hidden until configured.
There are no third-party advertising scripts, tracking pixels or customer-email placements.
Contributions do not change your plan, quota or features. See `docs/COMMUNITY-FUNDING.md`.

Cloud remains authoritative for quotas, consent, scheduling and sending. A successful
connection is not permission to send, and SMTP acceptance is not proof of inbox receipt.
Automated transport tests do not replace real platform installation and merchant acceptance.

**Existing installations:** back up your installation before updating. Updating the
source transport and backup/recovery protections requires updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Application rollback does not automatically restore older data or resend emails.
An up-to-date connector version or successful source check does not itself prove
that store cron is running. Follow the diagnostic and check cron in the module.

Verify the tag and archive using `RELEASES.md`.
