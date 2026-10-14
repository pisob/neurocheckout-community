# NeuroCheckout Community v0.1.0-preview.35

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Add optional sponsored text in Overview and voluntary support in Plan & data.
- Show neither placement to Starter, Pro, Enterprise or trial accounts.
- Keep support one-time and pay-what-you-want, with strictly separate Stripe test/live destinations.
- Hide funding when unavailable or entitlements are stale; never interrupt synchronization or sending.
- Preserve the reliability, recovery and safe-update protections of preview.34.
- Add browser, entitlement and authenticated-proxy regression coverage.

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
