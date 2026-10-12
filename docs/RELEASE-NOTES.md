# NeuroCheckout Community v0.1.0-preview.32

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Reliable cart product names and images, including products outside recent
  catalogue results. Incomplete product data pauses the affected email safely.
- Clear quota periods for Community, paid plans and trials, in English and French.
  Temporarily unavailable usage is shown as unknown, never as a false zero.
- Encrypted email archives retain the latest 50 confirmed originals plus up to 50
  known converted originals, for up to 30 days. Delivery history remains independent
  of the current quota window.
- Regression coverage for synchronization, email previews, archive retention
  after restart and backup compatibility.

Already removed email originals require a matching private backup; updating does
not recreate or resend them. Rolling back to an older application restores that
version's shorter archive retention policy. Use an up-to-date official connector
and let product synchronization finish. Previously delivered emails are unchanged.
Remote image availability and email client image blocking remain outside
Community's control.

**Existing installations:** back up your installation before updating. Updating the
source transport and backup/recovery protections requires updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Application rollback does not automatically restore older data or resend emails.
An up-to-date connector version or successful source check does not itself prove
that store cron is running. Follow the diagnostic and check cron in the module.

Verify the tag and archive using `RELEASES.md`.
