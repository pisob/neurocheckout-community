# Install NeuroCheckout Community

NeuroCheckout Community is a self-hosted interface. NeuroCheckout Cloud keeps
the business rules, Supervisor coordination, specialist-agent execution,
quotas, delivery and sensitive processing.

## Requirements

- a NeuroCheckout Cloud account with the Community plan active;
- Git;
- Docker Engine 24 or newer;
- Docker Compose v2;
- an HTTPS reverse proxy for any non-local installation.

## 1. Register the installation

Open **NeuroCheckout Cloud → Community installations** and create an
installation with its exact callback URL:

- local evaluation: `http://localhost:3400/api/auth/callback`;
- hosted installation: `https://community.example.com/api/auth/callback`.

Copy the public client ID. Community uses OAuth 2.0 Authorization Code with
PKCE and therefore does not require a client secret.

## 2. Configure the dashboard

From the repository root:

```bash
cp .env.example .env.local
openssl rand -base64 48
```

Edit `.env.local`:

```dotenv
NC_COMMUNITY_CLIENT_ID=nc_public_client_id_from_cloud
NC_COMMUNITY_REDIRECT_URI=http://localhost:3400/api/auth/callback
NC_CLOUD_API_BASE_URL=https://www.neurocheckout.com
NC_CLOUD_AUTHORIZATION_URL=https://www.neurocheckout.com/community/authorize
NC_CLOUD_UPGRADE_URL=https://www.neurocheckout.com/pricing
NC_COMMUNITY_SESSION_SECRET=replace_with_the_generated_random_value
NC_COMMUNITY_COOKIE_SECURE=false
```

For a hosted installation, use the exact HTTPS callback and set
`NC_COMMUNITY_COOKIE_SECURE=true`. Never commit `.env.local` or reuse the
session secret between installations.

## 3. Start with Docker Compose

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3400/api/health
```

The service listens on host loopback only. Open `http://localhost:3400` on the
same machine, or add an HTTPS reverse proxy for remote use.

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
starting the OAuth connection. The callback must match exactly.

## 4. Validate the connection

1. Select **Connect to Cloud**.
2. Review and authorize the requested scopes in NeuroCheckout Cloud.
3. Confirm that the overview shows the Cloud plan, quota, Supervisor and seven
   enabled specialist agents.
4. Create a test shop, save an email-template draft and verify that no customer
   data is stored by the Community container.

The contextual support agent is intentionally not displayed while its
per-store personalization remains disabled.

## Source-based development

```bash
npm ci
npm run dev
```

For a production-like local run:

```bash
npm run build
npm run start
```

## Upgrade

Back up `.env.local`, then:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
```

Review `CHANGELOG.md` before upgrading. If a release requests new OAuth scopes,
disconnect and reconnect the installation after the container is updated.

## Revoke or uninstall

First revoke the installation in **NeuroCheckout Cloud → Community
installations**. Then stop and remove the local container and image:

```bash
docker compose down
docker image rm neurocheckout-community:0.1.0-preview.1
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
- **Cloud request rejected after an update:** refresh the image and reconnect
  if the release added an OAuth scope or raised the minimum dashboard version.
