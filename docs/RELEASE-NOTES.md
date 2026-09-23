# NeuroCheckout Community v0.1.0-preview.20

Official signed prerelease adding the Partner program to the self-hosted
Community interface.

## Partner workspace

- Submit and follow a partner application in English or French.
- Copy the approved referral link and review attributed stores and engagement.
- Follow commission balances, Stripe onboarding and payout requests.
- Use a responsive workspace on desktop and mobile.

## Security boundary preserved

- Attribution, commission validation and payouts remain Cloud-authoritative.
- Dedicated read and write permissions restrict partner operations.
- Internal record identifiers, payment-account references and customer contact
  details are excluded from Community responses.
- Signed-tag, archive-signature, checksum, transactional activation and
  automatic rollback protections are unchanged.

## Regression protection

- Native checks cover secure updates, encrypted local data and relay behavior.
- Type checking, production build, responsive browser tests and CodeQL scans
  cover the partner workspace.

Verify the tag and attached archive using the instructions in `RELEASES.md`.
Expected signing fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Attached: source archive, SHA-256 checksum and detached OpenPGP signature.
Commerce connectors are distributed separately.
