# NeuroCheckout Community v0.1.0-preview.29

Official signed Community prerelease.

- Production account connection and local synchronization.
- Separate configuration and encrypted vaults for each environment.
- Multi-store synchronization with store-specific authorization.
- Updated installation instructions for production and separate testing instructions.

- Clearer synchronization blockers and scheduled processing attempts, in English and French.
- Recorded email language and content source: BYOK, custom library or database variant.
- Private multi-store backups with file-hash and SQLite integrity verification before activation.
- Recovery to a new directory without overwriting current data; startup rollback to the previous build.
- Disk-space preflight and actionable update failure messages.

**Existing installations:** the backup/recovery protections require updating and
restarting the root launcher using the manual procedure in `docs/INSTALLATION.md`.
The dashboard updater alone cannot replace a running old launcher.
See `docs/RECOVERY.md`. Backups contain private keys and configuration: keep them private.
Email diagnostics require the matching Cloud deployment; older messages without
recorded evidence display "Not recorded". No historical email is regenerated.

Verify the tag and archive using `RELEASES.md`.
