# NeuroCheckout Community v0.1.0-preview.34

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Distinguish connection, fresh store data, processing, sending eligibility and delivery evidence.
- Refresh quotas, agent performance and email conversions automatically after network recovery.
- Display unavailable observations as unknown, not zero or unlimited usage.
- Prevent overlapping relay attempts and preserve acknowledged-send protection on replay.
- Protect customized source files and local commits during automatic updates.
- Add regression coverage for guest/registered carts across all three supported
  platform contracts, encrypted recovery, multi-store isolation and browser journeys.

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
