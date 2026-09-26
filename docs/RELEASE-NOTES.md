# NeuroCheckout Community v0.1.0-preview.23

Official signed validation prerelease for Community.

## Maintenance

- Refresh the signed installation reference for this validation preview.
- The Community client behavior is unchanged from preview.22.
- Cloud-managed availability depends on the connected environment. This preview
  does not announce a production rollout of Cloud features.

## Security boundary preserved

- Release selection remains authorized by NeuroCheckout Cloud.
- Signed-tag, archive-signature, checksum, transactional activation and
  automatic rollback protections are unchanged.
- Local configuration and encrypted Community data remain preserved during an
  update.

## Regression protection

- Automated checks cover the Community update lifecycle and compatibility.
- Type checking, production build, integration tests and CodeQL scans cover the
  release candidate.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.
