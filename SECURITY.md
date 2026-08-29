# Security policy

Do not report security vulnerabilities in public issues. Use the private security contact published by NeuroCheckout Cloud.

Community stores Cloud access and refresh tokens only inside an encrypted, HTTP-only local session cookie. Keep `NC_COMMUNITY_SESSION_SECRET` private, unique and at least 32 random characters. Production callback URLs must use HTTPS.

If an installation or host may be compromised, revoke it immediately in **NeuroCheckout Cloud → Community installations**, rotate the local session secret, and reconnect.
