# NeuroCheckout Community v0.1.0-preview.38

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Display the currently published Cloud DPA when creating or rotating a connector key.
- Bind explicit consent to the displayed version, language and content fingerprint.
- Block unavailable documents and require new consent when publication changes.
- Isolate the document preview from scripts, forms and external resources.
- Preserve existing keys, synchronization, encrypted data and delivery history.
- Verify consent in English and French and isolation across selected stores.

Requires the coordinated Cloud published-document endpoint. Existing keys keep
working; older clients can use the Cloud API-key page for creation or rotation.

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
