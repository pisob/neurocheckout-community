# Security policy

Do not report security vulnerabilities in public issues. Use GitHub's
[private vulnerability reporting](https://github.com/pisob/neurocheckout-community/security/advisories/new)
to contact the maintainers confidentially.

The `0.1.0-preview` series receives security fixes while it is the current
technical preview. Compatibility fixes may require upgrading to the latest
preview before reconnecting to NeuroCheckout Cloud.

Community stores Cloud access and refresh tokens only inside an encrypted, HTTP-only local session cookie. Keep `NC_COMMUNITY_SESSION_SECRET` private, unique and at least 32 random characters. Production callback URLs must use HTTPS.

If an installation or host may be compromised, revoke it immediately in **NeuroCheckout Cloud → Community installations**, rotate the local session secret, and reconnect.
