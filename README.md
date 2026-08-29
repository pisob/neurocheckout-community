# NeuroCheckout Community

NeuroCheckout Community is the self-hosted, open-source member interface.
Business decisions, the eight-agent orchestration, quotas, delivery and sensitive
processing remain NeuroCheckout Cloud services. Community never embeds a Cloud
service secret and authenticates through OAuth 2.0 Authorization Code with PKCE
S256.

## Local setup

1. Activate the permanent Community plan in NeuroCheckout Cloud.
2. In **Dashboard → Community installations**, register `http://localhost:3400/api/auth/callback`.
3. Copy `.env.example` to `.env.local`, set the returned public client ID and generate a strong session secret.
4. Run `npm ci`, then `npm run dev`.
5. Open `http://localhost:3400` and select **Connect to Cloud**.

The dashboard requests only the scopes used by its current modules: profile,
capabilities, shops, templates, BYOK and connector-key management. Reconnect an
existing installation after a release adds a new scope.

## Included modules

- Cloud-calculated plan, quota, features and eight-agent availability;
- version compatibility and mandatory-update signal;
- Cloud-authorized shop creation with sender identity, brand logo and approval mode;
- per-shop sanitized, versioned email templates with publish and rollback;
- encrypted OpenAI BYOK configuration; raw keys never return to this app;
- per-shop connector-key creation or rotation with explicit DPA acceptance;
- seamless paid upgrade while continuing to use this same interface.

## Security boundary

- Browser → Community: encrypted HTTP-only local session cookie.
- Community server → Cloud: short-lived bearer access token.
- Renewal: rotating refresh token kept inside the encrypted cookie.
- Cloud remains authoritative for plan, status, quotas, features and installation revocation.
- Internal/back-office APIs are deny-by-default and absent from the public OpenAPI contract.
- Every Cloud BFF request carries the Community dashboard version. Incompatible
  versions are rejected by the Cloud outside the capability endpoint.

## Production

Use HTTPS, set `NC_COMMUNITY_COOKIE_SECURE=true`, use an exact HTTPS callback, and
deploy behind a reverse proxy that limits request sizes. Never commit `.env.local`.

Validate a release with:

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

Connector packages are not declared released until
`connectors/compatibility.json` marks an audited, tested and signed platform
artifact as `release_ready: true`.

## License

Apache-2.0. The NeuroCheckout name and visual identity are not granted by this code license; see `TRADEMARKS.md`.
