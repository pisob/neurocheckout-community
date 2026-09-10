# NeuroCheckout Community

> **Development branch — local-data architecture candidate.** These changes are
> published for staging evaluation, not as a new signed release. The installation
> instructions below still target the existing `v0.1.0-preview.4` release.
> Keep the local-data pilot disabled until the full integration is validated.

> **Official repository:** <https://github.com/pisob/neurocheckout-community> is
> the only canonical source for NeuroCheckout Community releases. Forks and
> mirrors are not official releases, even when they preserve the source code.

> **Technical Preview — v0.1.0-preview.4.** This release is intended for
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

- for continuous automation: an always-on server with a stable Internet connection;
  a laptop that sleeps or a computer that is switched off is suitable only for tests;
- a NeuroCheckout Cloud account; the free Community plan does not require a
  payment card;
- Git;
- GnuPG 2.x for release-signature verification;
- Node.js 22.13 or newer for this candidate (Node.js 22 LTS recommended);
- npm 10 or newer;
- outbound HTTPS access to `www.neurocheckout.com`;
- local port `3400`, or another available loopback port;
- for a public server: a domain name, HTTPS and a reverse proxy such as Caddy
  or Nginx.

Docker is not required. Check the native tools before installation:

```bash
git --version
gpg --version
node --version
npm --version
```

## Server availability

Keep the server hosting Community online continuously, including when nobody
is using the dashboard. Closing a browser tab is fine; stopping the server,
putting the computer to sleep or losing its Internet connection interrupts
availability. Configure the service to restart after reboot and monitor it.
Agents, scheduled workers and email delivery continue to run in NeuroCheckout
Cloud.

**Upcoming release:** when Cloud enables the server-availability requirement,
automations for the associated store pause after Community stops reporting
availability. Pending automated actions are checked again automatically when
the server reconnects. Normal delivery, cart and quota checks still apply;
reconnecting does not guarantee that every old action remains eligible. Emails
already accepted for delivery cannot be recalled. A manual approval that returns
an unavailable error remains pending and must be submitted again.

This feature is not included in the signed `v0.1.0-preview.4` installation below.
After upgrading to a release that includes it, reconnect to Cloud once to
register the server. Subsequent heartbeats run without an open browser and
survive server restarts. Preserve the private `.community-state/` directory
and the session secret together; Docker uses the `community-state` volume.
After loss of this state, reconnect to Cloud to register the server again.

This availability feature does not move existing store data. Local-only product
and cart storage is a separate development and is not provided by this release.

### Local product/cart data — staging pilot, not a released migration

The candidate includes an encrypted local store and signed server-to-server
read/write endpoints, disabled by default. This is **not** an alternative
installation procedure for the signed release below. It does not yet redirect
installed connectors or replace the existing Cloud agent data pipeline.
Do not enable it against production or claim that existing Cloud copies have
been removed. Agents, scheduling and email delivery remain in Cloud.

The pilot requires `NC_DEPLOYMENT_ENV=staging` and
`NC_LOCAL_DATA_PILOT_ENABLED=true`, plus explicit server-side vault setup.
An operator can initialize a new private vault using
`NC_DEPLOYMENT_ENV=staging npm run setup:local-data -- SHOP_ID` from the candidate
directory. This creates three separate keys in `.community-state/`; it does not
print keys or configure a connector. Never commit, publicly upload or expose
that directory. Host the data volume on a local filesystem, not NFS.

The candidate also supports **outbound-only Cloud reads**: Community opens a
long-poll HTTPS connection to the configured Cloud API and answers bounded read
requests using its local encrypted vault. You do not need to open a router port,
expose localhost, change DNS or keep a browser open. Keep Community bound to
loopback for a local-computer installation. The Cloud-side staging relay must
be deployed and explicitly enabled first; this is not part of the current
signed release's installation steps.

With both staging pilots enabled, a new OAuth connection registers a separate,
server-only relay credential, encrypted in `.community-state/data-relay.enc`.
The credential is bound to one store and installation; it does not authorize
Cloud member API calls. Preserve the private state and session secret together.
Reads fail closed while offline and retry after reconnection. This transport
does not move agents, scheduling or SMTP onto your computer.

The candidate now includes an outbound source-sync client with signed,
transactional batches and a persistent resume cursor. Source-managed vault reads
pause while synchronization is incomplete, has failed, or has not caught up for
60 seconds. The poller invalidates the previous ready state on startup. Its
source endpoint and dedicated secret are encrypted in the vault and included
in backups. A populated manual vault cannot be attached to a source silently.
The pilot currently requires a public IPv4 HTTPS source and refuses redirects,
private/reserved addresses and compressed responses.

Candidate connector routes are defined for PrestaShop, Magento and WooCommerce.
The private PrestaShop, Magento and WooCommerce candidates now include bounded, read-only
native export pilots, tested against synthetic MariaDB tables and this encrypted
store. Each is limited to 256 products plus carts and has not been validated on
a real store. The Magento pilot targets Open Source on one database; MSI stock
is explicitly not exported yet. The WooCommerce pilot targets default native
storage on 10.1.x, selects either legacy or HPOS orders, and does not treat a linked
order as proof of payment. Its runtime and checkout flows still need real-store
validation; custom storage is refused. All candidates
remain disabled by default and are not released or installed.

**Still pending:** scalable and business-complete connector export,
real-store staging validation, minimal event delivery
and migration of every Cloud agent data path.
A remote store cannot push to your `localhost`. Do not point its API endpoint
at localhost or enable the pilot as a completed migration. Only the isolated
candidate tests currently exercise the new read path.
`NC_CONNECTOR_PULL_ENABLED` therefore remains `false`. The candidate's
`setup:source-pull` command accepts an absolute path to an operator-owned,
mode-0600 JSON file with `endpoint` and `secret`; it does not create the required
connector endpoint or configure the store. Do not pass secrets on the command
line or use this as a signed-release installation step.

The pilot retains encrypted records for 30 days from their source timestamp,
with up to ten historical revisions per record. Expired records are not served;
physical cleanup runs on writes. Storage is bounded and further writes are
refused when capacity is reached. Opaque revision markers survive payload expiry
to reject older updates; these contain no product/cart details and are capped
at 100,000 distinct references per vault. Reaching that limit requires an
operator-controlled migration, not silently forgetting revision protection.
Back up both the vault and its keys privately;
losing the encryption key makes the records unreadable. A consistent backup to
a **new, absolute directory** can be created with
`NC_DEPLOYMENT_ENV=staging npm run backup:local-data -- /private/new-backup`.
Copying a running SQLite file alone is not a valid backup procedure.

This candidate uses Node's built-in SQLite API, still experimental in Node 22;
it is subject to staging validation, not a general-availability commitment.
See the [Node.js SQLite documentation](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html).

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
4. In the Cloud member dashboard, create or connect the store that this
   installation will manage. Store creation remains a Cloud operation.
5. Go to
   [Community installations](https://www.neurocheckout.com/dashboard/community).
6. Select the store, then enter an installation name and the exact callback URL:
   - local computer: `http://localhost:3400/api/auth/callback`;
   - public server: `https://community.example.com/api/auth/callback`.
7. Select **Create installation**, then copy the displayed public Client ID.
   It is not a secret and is the value requested by `npm run setup`.

Each active store can be assigned to only one active Community installation.
An account can keep at most two active Community installations. Revoke the old
installation in Cloud before replacing it for the same store.

If the account already has an active trial or paid Cloud plan, do not replace
it with the free plan. Go directly to **Community installations**: the
self-hosted interface will use the existing Cloud plan, features and quotas.

## Recommended installation — without Docker

1. Complete the Cloud activation and copy the public Client ID using the steps
   above.
2. Clone the current official signed release. Do not install directly from the
   moving `main` branch:

   ```bash
   git clone --branch v0.1.0-preview.4 --depth 1 \
     https://github.com/pisob/neurocheckout-community.git
   cd neurocheckout-community
   ```

   Git's `detached HEAD` notice is expected because an immutable release tag,
   rather than a moving development branch, is checked out.

3. Verify the release tag before running any project script:

   ```bash
   verification_home="$(mktemp -d)"
   chmod 700 "${verification_home}"
   GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
   GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
     2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
   GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.4
   find "${verification_home}" -depth -delete
   unset verification_home
   ```

   Continue only if the fingerprint is exactly
   `2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0` and Git reports a good
   signature from `NeuroCheckout Community Release <contact@neurocheckout.com>`.
   A trust warning is normal for a freshly imported key; a bad signature,
   different fingerprint or different signer is not.

4. Run the guided setup:

   ```bash
   npm run setup
   ```

   Enter the public client ID returned by Cloud. The setup assistant creates a
   private `.env.local`, generates the session secret and selects the correct
   cookie security for the callback URL.

5. Install, diagnose and build the dashboard:

   ```bash
   npm run install:native
   ```

6. Start Community:

   ```bash
   npm start
   ```

7. Open `http://localhost:3400` and select **Connect to Cloud**.

`npm run doctor` can be repeated at any time. It validates Node.js, the local
configuration, callback/cookie consistency, the production build and actual
reachability of NeuroCheckout Cloud without exposing credentials.

## Optional Docker installation

Native Linux installations started with `npm start` include an **Update
securely** button when Cloud recommends an update. Confirm it to verify,
prepare and activate the new signed release. Keep the terminal open during
the update. Configuration is preserved and a failed activation restores the
previous build. Docker installations use the manual update guide instead.

Versions before `.4` need one manual upgrade to obtain this button. Future
changes to the native launcher itself may also require a manual upgrade.

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
- read-only access to the single store assigned during Cloud registration;
- per-shop brand and editorial rules for AI-assisted email generation;
- three AI-assisted previews for reviewing the configured editorial direction;
- encrypted OpenAI or Anthropic BYOK configuration, with one active provider
  per shop; raw keys never return to this app;
- per-shop connector-key creation or rotation with explicit DPA acceptance;
- seamless paid upgrade while continuing to use this same interface.

## Configure your email style

Community does not ask the merchant to write one fixed abandoned-cart or
recommendation email. In **Configuration → Emails**, the merchant defines a
reusable editorial frame: language, tone, formal or informal address, length,
discount policy, approval mode, required or forbidden expressions, and an
optional signature.

With a personal OpenAI or Anthropic key configured for the shop, the dashboard
can produce three previews so the merchant can review the selected direction.
The merchant can keep both provider keys configured and explicitly select which
one is active. A preview does not send a customer email. Email orchestration and
delivery decisions stay inside NeuroCheckout Cloud and are not part of this
public repository.

## Security boundary

- Browser → Community: encrypted HTTP-only local session cookie.
- Community server → Cloud: short-lived bearer access token.
- Renewal: rotating refresh token kept inside the encrypted cookie.
- Cloud remains authoritative for plan, status, quotas, features and installation revocation.
- Internal/back-office APIs are deny-by-default and absent from the public OpenAPI contract.
- Every Cloud BFF request carries the Community dashboard version. Incompatible
  versions are rejected by the Cloud outside the capability endpoint.
- Cloud applies separate request budgets per account and installation, stricter
  mutation and AI-preview limits, bounded AI-generation concurrency and
  temporary throttling with HTTP `429` when a budget is exhausted.
- Costly Community operations fail closed with HTTP `503` if their shared
  resource guard is unavailable. Cloud operators can also suspend Community
  access independently of the production member dashboard.

## Supported environments and support boundary

- Node.js 22 LTS is the supported native runtime.
- Docker is supported through the repository Dockerfile and Compose file.
- Linux is the reference production host. macOS and Windows are supported for
  local evaluation through Node.js; Windows production hosting is not supported.
- A public reverse proxy must preserve the exact HTTPS callback URL.

Support covers reproducible issues on these documented environments. Modified
forks, custom reverse proxies, third-party process managers and unreleased
connectors may require community diagnosis before maintainers can reproduce an
issue.

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

Official release archives are published with a SHA-256 checksum, an OpenPGP
signature and a signed Git tag. Verify all three before installing a downloaded
archive by following [`RELEASES.md`](RELEASES.md). The historical
`v0.1.0-preview.1` technical preview predates this policy and is not an official
signed release.

Connector packages are not declared released until
`connectors/compatibility.json` marks an audited, tested and signed platform
artifact as `release_ready: true`.

See `CHANGELOG.md` for release notes and known limitations.

## License

Apache-2.0. The NeuroCheckout name and visual identity are not granted by this
code license; see `TRADEMARKS.md` and `BRAND-ASSETS-LICENSE.md`.
