# NeuroCheckout Community v0.1.0-preview.17

Official signed security prerelease hardening public presentation throughout
the self-hosted Community interface.

## Public presentation boundary

- The **Plan & data** workspace now shows a concise explanation of data
  protection instead of implementation-specific service architecture.
- Feature, agent, status, metric and journey identifiers are translated through
  an explicit public allowlist before display.
- Unknown identifiers fail closed to neutral user-facing labels.

## Error and identifier protection

- Raw Cloud errors are no longer rendered directly by dashboard workspaces.
- Delivery failures and unknown service values use localized, approved copy
  without exposing internal component names or operational identifiers.
- Administrative secrets remain visible only in the explicit one-time
  generation flow where the administrator requested them.

## Regression protection

- Native release checks reject known internal architecture labels in public UI
  sources and direct rendering of raw subscription status values.
- Type checking, production build, integration smoke tests and security scans
  cover the release candidate.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
