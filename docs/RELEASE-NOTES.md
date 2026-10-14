# NeuroCheckout Community v0.1.0-preview.33

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Progressively space repeated connection attempts after authorization failures.
- Resume promptly when credentials are renewed or the application is updated.
- Avoid overlapping heartbeat requests and keep each store's retries independent.
- Preserve authentication checks: a paused or failed request never authorizes
  synchronization or email delivery.
- Include regression tests for rejected credentials, network failures, recovery
  and simultaneous requests.

Healthy connections continue using the existing heartbeat schedule. Retry delays
are held in memory; restarting the application permits a fresh attempt. Repeated
authorization failures may still require reconnecting the installation from its
configuration page.

**Existing installations:** back up your installation before updating. Updating the
source transport and backup/recovery protections requires updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Application rollback does not automatically restore older data or resend emails.
An up-to-date connector version or successful source check does not itself prove
that store cron is running. Follow the diagnostic and check cron in the module.

Verify the tag and archive using `RELEASES.md`.
