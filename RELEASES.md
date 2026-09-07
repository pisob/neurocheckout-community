# Official releases

The only canonical repository and release page are:

- <https://github.com/pisob/neurocheckout-community>
- <https://github.com/pisob/neurocheckout-community/releases>

Forks, mirrors, source snapshots and packages published elsewhere are not
official NeuroCheckout Community releases.

## Required release proofs

An official release must include all of the following:

1. a signed Git tag whose commit belongs to the canonical repository;
2. `neurocheckout-community-VERSION.tar.gz`;
3. `neurocheckout-community-VERSION.tar.gz.sha256`;
4. `neurocheckout-community-VERSION.tar.gz.asc`.

The tag and archive signatures must verify with `RELEASE-PUBLIC-KEY.asc`. The
Cloud separately maintains an exact allowlist and emergency denylist. A valid
signature does not override a Cloud compatibility or vulnerability block.

Official signing-key fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

The historical `v0.1.0-preview.1` technical preview predates this policy. It is
kept for traceability but is not an official signed release.

## Verify a signed Git checkout

Clone the exact tag advertised on the official release page, import the
committed release key into a temporary keyring, compare its fingerprint with
the fingerprint above, and verify the annotated tag before running any project
script:

```bash
git clone --branch v0.1.0-preview.2 --depth 1 \
  https://github.com/pisob/neurocheckout-community.git
cd neurocheckout-community
verification_home="$(mktemp -d)"
chmod 700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
  2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.2
find "${verification_home}" -depth -delete
unset verification_home
```

Do not replace the signed tag with `main`, a branch, a fork or a commit hash.
Stop if the fingerprint, signer or signature does not match.

## Verify a downloaded release

Place the archive, `.sha256`, `.asc`, and this repository's
`RELEASE-PUBLIC-KEY.asc` in the same directory, then run:

```bash
./tools/verify-community-release.sh \
  neurocheckout-community-VERSION.tar.gz \
  neurocheckout-community-VERSION.tar.gz.sha256 \
  neurocheckout-community-VERSION.tar.gz.asc
```

Do not install the archive if checksum, signature, filename, or signer
verification fails.

## Maintainer release procedure

The private signing key must remain outside Git. Create and sign the annotated
tag, then run the release builder from a clean checkout:

```bash
NC_RELEASE_GNUPGHOME=/absolute/private/gnupg-home \
NC_RELEASE_GPG_PASSPHRASE_FILE=/absolute/private/passphrase \
  ./tools/build-community-release.sh vVERSION /absolute/release-output
```

Upload the three generated files to the matching GitHub release. Never publish
an archive produced from an unsigned tag.
