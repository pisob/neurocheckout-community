# NeuroCheckout Community v0.1.0-preview.18

Official signed prerelease improving secure-update reliability on slow or
rate-limited Internet connections.

## Reliable secure updates

- **Update securely** downloads canonical release assets without depending on
  the anonymous GitHub API quota.
- Transient download and rate-limit failures are retried with bounded timeouts.
- A private persistent npm cache reduces repeated registry downloads and helps
  slow installations complete successfully.
- The interface now reports the secure-download phase explicitly.

## Security guarantees preserved

- Every update still requires the canonical signed Git tag and the pinned
  NeuroCheckout Community OpenPGP signer.
- The archive signature, SHA-256 checksum and exact equality with the signed
  Git tree are all verified before dependencies are installed.
- Health checks, transactional activation and automatic rollback remain
  mandatory; failed candidates never replace the working installation.

## Regression protection

- Automated tests cover canonical asset URLs, transient retry behavior,
  terminal failures, size limits and the absence of anonymous GitHub API calls.
- Type checking, production build, integration smoke tests and CodeQL scans
  cover the release candidate.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
