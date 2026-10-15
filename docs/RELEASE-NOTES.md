# NeuroCheckout Community v0.1.0-preview.37

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Distinguish Cloud failures from empty approval queues and reject obsolete filter responses.
- Add pagination beyond the first 50 email approvals; protect send/reject actions during refresh.
- Open linked menus consistently, including browser back/forward navigation.
- Show a useful setup path for accounts without stores, without an endless loading indicator.
- Require fresh store-source evidence before reporting setup readiness.
- Display the authorized store attached to an email quota when supplied by Cloud.
- Refresh messages and journey evidence safely, with response validation and bounded timeouts.
- Preserve encrypted data, quotas, delivery history and optional funding settings.
- Add 13 synthetic browser scenarios for menu, error, pagination and concurrency regressions.

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
