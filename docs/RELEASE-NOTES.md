# NeuroCheckout Community v0.1.0-preview.19

Official signed prerelease aligning the Community performance summary with the
presentation supplied by NeuroCheckout Cloud.

## Performance presentation

- Community follows the presentation mode supplied by the authenticated Cloud
  response for the estimated net ROI summary.
- Supporting performance evidence remains visible consistently across the two
  interfaces.
- Existing installations retain the previous presentation when the optional
  mode is not supplied.

## Security boundary preserved

- Agent calculations remain Cloud-authoritative.
- Community receives only the user-facing result required for display.
- Signed-tag, archive-signature, checksum, transactional activation and
  automatic rollback protections are unchanged.

## Regression protection

- Native checks cover the performance contract and its safe fallback.
- Type checking, production build, integration smoke tests and CodeQL scans
  cover the release candidate.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
