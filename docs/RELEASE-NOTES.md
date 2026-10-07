# NeuroCheckout Community v0.1.0-preview.30

Official signed prerelease. Production connectivity is supported; this remains
a preview pending full merchant acceptance.

- Update activation verifies the exact expected application version.
- Backups are restored and verified in a private temporary directory before activation.
- Failed activation returns to the previous application without rewinding store data.
- Synchronization diagnostics distinguish authentication refusal, invalid signatures,
  unavailable sources and stale evidence, with suggested next steps in English and French.
- A failed status refresh no longer leaves an old healthy indicator visible.
- Additional recovery, synchronization and browser regression tests.
- Documented acceptance criteria for a future stable release.

**Existing installations:** the backup/recovery protections require updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Application rollback does not automatically restore older data or resend emails.
An up-to-date connector version or successful source check does not itself prove
that store cron is running. Follow the diagnostic and check cron in the module.

Verify the tag and archive using `RELEASES.md`.
