# NeuroCheckout Community v0.1.0-preview.31

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Store synchronization supports public IPv4 and IPv6 with automatic connection fallback.
- Signed requests, response verification, connection deadlines and private-address
  protection remain enforced.
- Synchronization diagnostics distinguish an unavailable store source from an
  offline Community installation, with guidance in English and French.
- Temporary source outages retry automatically while dependent actions pause safely.
- Additional regression coverage for connection recovery and automatic source setup.
- Installation instructions and version examples point to this signed release.

**Existing installations:** back up your installation before updating. Updating the
source transport and backup/recovery protections requires updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Application rollback does not automatically restore older data or resend emails.
An up-to-date connector version or successful source check does not itself prove
that store cron is running. Follow the diagnostic and check cron in the module.

Verify the tag and archive using `RELEASES.md`.
