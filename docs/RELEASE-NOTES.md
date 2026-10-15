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

Requires the coordinated Cloud local-approval deployment and activation. Older
clients remain blocked from automatic sending when their store uses manual approval.
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
