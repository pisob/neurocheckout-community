# Install NeuroCheckout Community

NeuroCheckout Community is a self-hosted interface. NeuroCheckout Cloud keeps
the business rules, Supervisor coordination, specialist-agent execution,
quotas, delivery and sensitive processing.

## Requirements

- a NeuroCheckout Cloud account; the free Community plan does not require a
  payment card;
- Git;
- GnuPG 2.x;
- Node.js 22 or newer and npm 10 or newer;
- outbound HTTPS access to `www.neurocheckout.com`;
- an available loopback port, `3400` by default;
- an HTTPS reverse proxy for any non-local installation.

Docker Engine 24 and Docker Compose v2 are optional alternatives. They are not
required for the recommended native installation.

Verify the native requirements:

```bash
git --version
gpg --version
node --version
npm --version
```

## Obtain and verify the official release

Install a fixed signed release, not the moving development branch:

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

Git's `detached HEAD` notice is expected for an installation pinned to an
immutable release tag.

Stop if the fingerprint differs from
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0`, if Git does not report a
good signature from
`NeuroCheckout Community Release <contact@neurocheckout.com>`, or if the tag
cannot be verified. A trust warning after importing the dedicated release key
into a new temporary keyring is expected and does not mean that the signature
is invalid.

## 1. Register the installation

1. Create an account at
   [www.neurocheckout.com/register](https://www.neurocheckout.com/register), or
   [sign in](https://www.neurocheckout.com/login). Verify the account email if
   requested.
2. Open the
   [plan selection page](https://www.neurocheckout.com/onboarding/subscription)
   and select **Activate Community** or **Continue free with Community**. No
   payment card is required.
3. In the Cloud member dashboard, create or connect the store that this
   installation will manage.
4. Open
   [NeuroCheckout Cloud → Community installations](https://www.neurocheckout.com/dashboard/community).
5. Select that store and create an installation with its exact callback URL:

   - local evaluation: `http://localhost:3400/api/auth/callback`;
   - hosted installation: `https://community.example.com/api/auth/callback`.

6. Copy the displayed public Client ID. Community uses OAuth 2.0 Authorization
   Code with PKCE and therefore does not require a client secret.

Community Free enables one store, Supervisor plus seven enabled specialist
agents, and 100 emails per account over a rolling 24-hour window. If the
account already has an active trial or paid Cloud plan, skip free-plan
activation and go directly to **Community installations**. The self-hosted
interface uses the existing Cloud plan and quotas.

One active store can be assigned to only one active Community installation.
An account can keep at most two active installations. Revoke an existing
installation in Cloud before replacing it for the same store.

## 2. Configure the dashboard automatically

From the repository root:

```bash
npm run setup
```

The assistant asks only for the public client ID and exact callback URL. It
generates a strong session secret, writes `.env.local` with permission `0600`
and never displays the secret.

For an unattended installation, pass the two public values explicitly:

```bash
npm run setup -- \
  --client-id=nc_public_client_id_from_cloud \
  --redirect-uri=https://community.example.com/api/auth/callback
```

The resulting private file contains:

```dotenv
NC_COMMUNITY_CLIENT_ID=nc_public_client_id_from_cloud
NC_COMMUNITY_REDIRECT_URI=https://community.example.com/api/auth/callback
NC_CLOUD_API_BASE_URL=https://www.neurocheckout.com
NC_CLOUD_AUTHORIZATION_URL=https://www.neurocheckout.com/community/authorize
NC_CLOUD_UPGRADE_URL=https://www.neurocheckout.com/pricing
NC_COMMUNITY_SESSION_SECRET=automatically_generated_random_value
NC_COMMUNITY_COOKIE_SECURE=true
```

For local HTTP, the assistant sets `NC_COMMUNITY_COOKIE_SECURE=false`. For a
hosted HTTPS callback, it sets the value to `true`. Never commit `.env.local`
or reuse the session secret between installations.

## 3. Install and start without Docker

```bash
npm run install:native
npm start
```

`install:native` installs the locked dependencies, runs the Cloud diagnostic
and creates the optimized standalone build. Community then listens only on
`127.0.0.1:3400`.

In another terminal, verify it:

```bash
curl --fail http://127.0.0.1:3400/api/health
```

Open `http://localhost:3400` on the same machine, or add an HTTPS reverse proxy
for remote use.

To use another loopback port:

```bash
PORT=3500 npm start
```

The registered OAuth callback must use the same port.

## 4. Keep Community running with systemd

The repository includes `deploy/neurocheckout-community.service`. It expects
the repository at `/opt/neurocheckout-community`, a Linux account named
`neurocheckout`, and a system-wide npm executable at `/usr/bin/npm`.

After adapting those three values if necessary:

```bash
sudo cp deploy/neurocheckout-community.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now neurocheckout-community
sudo systemctl status neurocheckout-community
```

The unit starts only the Community interface, reads `.env.local` through the
native launcher, restarts after a failure and does not expose port 3400 beyond
the server loopback interface.

## 5. Configure HTTPS

Example Caddy configuration:

```caddyfile
community.example.com {
    encode gzip zstd
    request_body {
        max_size 2MB
    }
    reverse_proxy 127.0.0.1:3400
}
```

Register `https://community.example.com/api/auth/callback` in Cloud before
starting the OAuth connection. Run `npm run setup` again if the callback
changes; it preserves the existing session secret.

## 6. Validate the connection

Before opening the browser, the diagnostic must pass:

```bash
npm run doctor
```

1. Select **Connect to Cloud**.
2. Review and authorize the requested scopes in NeuroCheckout Cloud.
3. Confirm that the overview shows the Cloud plan, quota, Supervisor and seven
   enabled specialist agents.
4. Confirm that Configuration displays only the store selected during Cloud
   registration. Configure its editorial email rules and generate a preview
   with a shop-owned OpenAI or Anthropic key. Choose the provider under
   **Configuration → AI key**; only the selected provider is used for that
   shop. A preview never sends a customer email.

The contextual support agent is intentionally not displayed while its
per-store personalization remains disabled.

## Optional Docker installation

Administrators who prefer a container can use the same `.env.local`:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3400/api/health
```

Do not run the native service and Docker Compose simultaneously on port 3400.

## Source-based development

```bash
npm ci
npm run dev
```

For a production-like local run, use the same native path as end users:

```bash
npm run build
npm run doctor
npm run start
```

## Upgrade

Read the new release notes, replace `vNEW_SIGNED_VERSION` below with its exact
published tag, and back up `.env.local` outside the repository. For a native
installation:

```bash
git fetch --tags origin
git checkout --detach vNEW_SIGNED_VERSION
verification_home="$(mktemp -d)"
chmod 700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
  2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
GNUPGHOME="${verification_home}" git verify-tag vNEW_SIGNED_VERSION
find "${verification_home}" -depth -delete
unset verification_home
npm ci
npm run doctor
npm run build
sudo systemctl restart neurocheckout-community
```

For Docker:

```bash
git fetch --tags origin
git checkout --detach vNEW_SIGNED_VERSION
verification_home="$(mktemp -d)"
chmod 700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
  2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
GNUPGHOME="${verification_home}" git verify-tag vNEW_SIGNED_VERSION
find "${verification_home}" -depth -delete
unset verification_home
docker compose build --pull
docker compose up -d
```

As during installation, continue only if the displayed fingerprint and signer
match the official values. Review `CHANGELOG.md` before upgrading. If a release
requests new OAuth scopes, disconnect and reconnect the installation after the
container is updated.

## Revoke or uninstall

First revoke the installation in **NeuroCheckout Cloud → Community
installations**. For a native systemd installation:

```bash
sudo systemctl disable --now neurocheckout-community
sudo rm /etc/systemd/system/neurocheckout-community.service
sudo systemctl daemon-reload
```

For Docker, stop and remove the local container and image:

```bash
docker compose down --rmi local
```

Delete `.env.local` only after confirming that its session secret is no longer
needed. Business data remains governed by the Cloud account and is not removed
by deleting the Community container.

## Troubleshooting

- **Callback rejected:** compare the registered callback and
  `NC_COMMUNITY_REDIRECT_URI` character for character.
- **Connection returns to the login screen:** verify the public client ID and
  keep the same session secret across container restarts.
- **Cookie missing behind HTTPS:** set `NC_COMMUNITY_COOKIE_SECURE=true` and
  ensure the proxy forwards the HTTPS scheme.
- **Cloud request rejected after an update:** update the native build or Docker
  image, then reconnect if the release added an OAuth scope or raised the
  minimum dashboard version.
- **`npm start` reports a missing build:** run `npm run install:native` again.
- **Doctor reports Cloud unreachable:** verify outbound HTTPS access to
  `www.neurocheckout.com`; no inbound Cloud connection is required.
