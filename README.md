# NeuroCheckout Community

> **Technical Preview — v0.1.0-preview.1.** This release is intended for
> evaluation and integration testing. Treat the Cloud API contract, deployment
> process and user experience as pre-stable until the first stable release.

NeuroCheckout Community is the self-hosted, open-source member interface.
Business decisions, Supervisor coordination, the seven currently enabled
specialist agents, quotas, delivery and sensitive processing remain
NeuroCheckout Cloud services. Community never embeds a Cloud service secret
and authenticates through OAuth 2.0 Authorization Code with PKCE S256. The
contextual support agent remains hidden while its per-store personalization is
not release-ready.

## Requirements

- a NeuroCheckout Cloud account with the Community plan active;
- a Community installation registered in Cloud and its public client ID;
- Git;
- Node.js 22 or newer;
- npm 10 or newer;
- outbound HTTPS access to `www.neurocheckout.com`;
- local port `3400`, or another available loopback port;
- for a public server: a domain name, HTTPS and a reverse proxy such as Caddy
  or Nginx.

Docker is not required. Check the native tools before installation:

```bash
git --version
node --version
npm --version
```

## Recommended installation — without Docker

1. Activate the Community plan in NeuroCheckout Cloud.
2. In **Dashboard → Community installations**, register
   `http://localhost:3400/api/auth/callback` for a local evaluation.
3. Clone the repository and run the guided setup:

   ```bash
   git clone https://github.com/pisob/neurocheckout-community.git
   cd neurocheckout-community
   npm run setup
   ```

   Enter the public client ID returned by Cloud. The setup assistant creates a
   private `.env.local`, generates the session secret and selects the correct
   cookie security for the callback URL.

4. Install, diagnose and build the dashboard:

   ```bash
   npm run install:native
   ```

5. Start Community:

   ```bash
   npm start
   ```

6. Open `http://localhost:3400` and select **Connect to Cloud**.

`npm run doctor` can be repeated at any time. It validates Node.js, the local
configuration, callback/cookie consistency, the production build and actual
reachability of NeuroCheckout Cloud without exposing credentials.

## Optional Docker installation

Docker remains available for administrators who prefer container isolation:

```bash
npm run setup
docker compose up --build -d
```

For HTTPS, systemd, Docker, upgrades and uninstall, follow the
[complete installation guide](docs/INSTALLATION.md).

The dashboard requests only the scopes used by its current modules: profile,
capabilities, shops, templates, BYOK and connector-key management. Reconnect an
existing installation after a release adds a new scope.

## Included modules

- Cloud-calculated plan, quota and feature availability;
- Supervisor coordination and seven currently enabled specialist agents;
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

Use HTTPS, set `NC_COMMUNITY_COOKIE_SECURE=true`, register the exact HTTPS
callback and deploy behind a reverse proxy that limits request sizes. Both the
native launcher and provided Compose service bind only to `127.0.0.1`, so the
reverse proxy remains the public entry point. Never commit `.env.local`.

Validate a release with:

```bash
npm run test:native
npm run typecheck
npm run build
npm run smoke:integration
npm run doctor
npm audit --omit=dev
docker compose config
docker build -t neurocheckout-community:local .
```

Connector packages are not declared released until
`connectors/compatibility.json` marks an audited, tested and signed platform
artifact as `release_ready: true`.

See `CHANGELOG.md` for release notes and known limitations.

## License

Apache-2.0. The NeuroCheckout name and visual identity are not granted by this code license; see `TRADEMARKS.md`.
