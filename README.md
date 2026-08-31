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

- a NeuroCheckout Cloud account; the free Community plan does not require a
  payment card;
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

## Activate Community in NeuroCheckout Cloud

Yes, the customer first uses the official NeuroCheckout website:

1. Open [www.neurocheckout.com/register](https://www.neurocheckout.com/register)
   to create an account, or [sign in](https://www.neurocheckout.com/login) with
   an existing account. Complete email verification if requested.
2. Open the [plan selection page](https://www.neurocheckout.com/onboarding/subscription).
3. Select **Activate Community** or **Continue free with Community**. No payment
   card is requested. Cloud activates the Community allowance for one store,
   Supervisor plus seven enabled specialist agents, and 100 emails per account
   over a rolling 24-hour window.
4. After Cloud opens the member dashboard, go to
   [Community installations](https://www.neurocheckout.com/dashboard/community).
5. Enter an installation name and the exact callback URL:
   - local computer: `http://localhost:3400/api/auth/callback`;
   - public server: `https://community.example.com/api/auth/callback`.
6. Select **Create installation**, then copy the displayed public Client ID.
   It is not a secret and is the value requested by `npm run setup`.

If the account already has an active trial or paid Cloud plan, do not replace
it with the free plan. Go directly to **Community installations**: the
self-hosted interface will use the existing Cloud plan, features and quotas.

## Recommended installation — without Docker

1. Complete the Cloud activation and copy the public Client ID using the steps
   above.
2. Clone the repository and run the guided setup:

   ```bash
   git clone https://github.com/pisob/neurocheckout-community.git
   cd neurocheckout-community
   npm run setup
   ```

   Enter the public client ID returned by Cloud. The setup assistant creates a
   private `.env.local`, generates the session secret and selects the correct
   cookie security for the callback URL.

3. Install, diagnose and build the dashboard:

   ```bash
   npm run install:native
   ```

4. Start Community:

   ```bash
   npm start
   ```

5. Open `http://localhost:3400` and select **Connect to Cloud**.

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
