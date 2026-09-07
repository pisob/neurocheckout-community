# Security policy

## Official source and release verification

The only official NeuroCheckout Community repository is
<https://github.com/pisob/neurocheckout-community>. Treat every other repository,
mirror, package or download as a third-party distribution.

Official release archives must have a signed Git tag, a matching SHA-256 file
and a detached OpenPGP signature verifiable with `RELEASE-PUBLIC-KEY.asc`. See
[`RELEASES.md`](RELEASES.md). A release missing any of these proofs is not an
official NeuroCheckout Community release.

Expected OpenPGP fingerprint:
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`.

Do not report security vulnerabilities in public issues. Use GitHub's
[private vulnerability reporting](https://github.com/pisob/neurocheckout-community/security/advisories/new)
to contact the maintainers confidentially.

The `0.1.0-preview` series receives security fixes while it is the current
technical preview. Compatibility fixes may require upgrading to the latest
preview before reconnecting to NeuroCheckout Cloud.

Community stores Cloud access and refresh tokens only inside an encrypted, HTTP-only local session cookie. Keep `NC_COMMUNITY_SESSION_SECRET` private, unique and at least 32 random characters. Production callback URLs must use HTTPS.

If an installation or host may be compromised, revoke it immediately in **NeuroCheckout Cloud → Community installations**, rotate the local session secret, and reconnect.
