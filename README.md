# NeuroCheckout Community

NeuroCheckout Community is the official self-hosted dashboard for connecting
PrestaShop, WooCommerce and Magento stores to NeuroCheckout Cloud. Store data is
kept in an encrypted local vault; the dashboard lets you configure your stores,
review email activity and approvals, and check synchronization.

Official repository: https://github.com/pisob/neurocheckout-community

**Current preview:** Community **0.1.0-preview.55**, with PrestaShop **4.6.14**,
WooCommerce **1.0.16** and Magento **1.0.12** connectors. Community remains a
**prerelease**, including when connected to production. Use signed downloads,
keep a private backup and verify each store before enabling customer emails.
Updating Community or a connector does not activate campaigns.

[User guide — English / français](docs/USER_GUIDE.md) ·
[Installation guide](docs/INSTALLATION.md) ·
[Official releases](https://github.com/pisob/neurocheckout-community/releases)

## Connection interruptions and connector rotation

Temporary Cloud errors and request limits pause synchronization without presenting
an expired login. The dashboard honors the server's waiting period and retries;
an explicit authentication rejection still requires reconnection. Local data and
settings are preserved. A key rotation that needs manual copying now explains how
to update the store connector instead of claiming that synchronization succeeded.
The matching Cloud and WooCommerce corrections preserve read availability and
encrypted source state when connector credentials change.

## Requirements

- Linux or macOS;
- Node.js **22.13 or newer**, npm **10 or newer**, Git and GnuPG **2.x**;
- a NeuroCheckout account and a Community Client ID, obtained below;
- continuous outbound HTTPS access and an available local port, **3400** by default.

Docker is optional. A localhost installation needs no inbound Internet port.
Community's computer or server must remain online: dependent actions pause when
it is unavailable. Community must also reach the store's public HTTPS connector;
a successful connector-to-Cloud test alone does not prove synchronization.

## 1. Create your Cloud account before installing Community

1. [Create an account](https://www.neurocheckout.com/register) or
   [sign in](https://www.neurocheckout.com/login). Verify your email if requested.
2. For a new free account, open [plan selection](https://www.neurocheckout.com/onboarding/subscription)
   and choose **Activate Community** / **Continue free with Community**.
   No payment card is required. **Already subscribed or in an active trial? Keep
   that plan and skip free activation.**
3. In the Cloud dashboard, create or select the store that Community will manage.

## 2. Register your installation and copy its public Client ID

Community does not need to be installed or running for this step.

1. Open [Community installations](https://www.neurocheckout.com/dashboard/community).
2. Create an installation for your store and give it a recognizable name.
3. Register the exact callback URL for your installation:

   | Installation | Callback URL |
   | --- | --- |
   | Your computer | `http://localhost:3400/api/auth/callback` |
   | Your HTTPS server | `https://community.example.com/api/auth/callback` — replace the example domain |

4. Copy the displayed **Client ID**, beginning with `nc_`. For an existing
   installation, retrieve its Client ID instead of creating a duplicate.

The Client ID is a **public OAuth identifier**, not a password or connector API
key. You still sign in and authorize access in the browser. The callback is the
address where your browser returns to Community, **not your store address**.
Use exactly the same callback in Cloud and in the setup assistant.

## 3. Download and verify an official preview

Install the current signed tag, rather than the development branch:

```bash
git clone --branch v0.1.0-preview.55 --depth 1 \
  https://github.com/pisob/neurocheckout-community.git
cd neurocheckout-community
```

The detached-HEAD message is expected when installing a release tag.
Verify the tag before running project scripts:

```bash
verification_home="$(mktemp -d)"
chmod 700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
  2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.55
find "${verification_home}" -depth -delete
unset verification_home
```

Continue only if the fingerprint is exactly
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0` and Git reports a good
signature from `NeuroCheckout Community Release <contact@neurocheckout.com>`.
A first-import trust warning is normal; a bad signature is not.
See [RELEASES.md](RELEASES.md) to verify downloaded archives and checksums.

## 4. Configure, install and start Community

From the `neurocheckout-community` directory, run:

```bash
npm run setup -- --environment=production
```

Enter the **public Client ID** and the **exact callback URL** from step 2.
Do not enter a password, API key or MCP URL. The assistant creates the private
configuration. If you are waiting at the Client ID prompt, complete step 2 in
your browser, then return to the terminal.

After setup succeeds:

```bash
npm run install:native
npm start
```

For Docker, HTTPS hosting or a Linux service, follow the
[complete installation guide](docs/INSTALLATION.md).

## 5. Connect your installation to Cloud

Open http://localhost:3400 and select **Connect to Cloud**. Sign in with the
account that owns the installation. Community creates its encrypted local vault
and starts synchronization for eligible stores with configured connectors.

Check the selected store and **Sync health**. No additional synchronization
secret, server file or SSH access is needed for the standard setup.

## Connect an ecommerce platform

Install the official connector for your platform and follow its README:

- [PrestaShop](https://github.com/pisob/neurocheckout-connector-prestashop)
- [WooCommerce](https://github.com/pisob/neurocheckout-connector-woocommerce)
- [Magento](https://github.com/pisob/neurocheckout-connector-magento)

Use module packages published under **Releases**. GitHub's **Code → Download ZIP**
contains development sources, not an installable module package. Community and
store connectors are updated separately.

## Using Community

The [user guide, in English and French](docs/USER_GUIDE.md), covers email style,
AI-provider configuration, manual approvals, sent email previews, synchronization,
plans and billing. Plan changes do not delete the local vault. Available features
and quotas depend on your account.

Order history starts after the first complete source synchronization and is due
again seven days after a completed pass. It covers **registered accounts with
orders, not guest orders**. Per-account limits are up to 128 orders, 512 lines and
64 KiB; some platform limits are stricter. An overflow or partial import reports
an error rather than silently truncating history. Cached histories expire after
30 days without a successful refresh; capacity is 10,000 accounts / 128 MiB.

Email history can show original copies only when they were archived. Originals
expire after 30 days; a missing copy is shown as unavailable. Opening a preview
does not resend an email, and an open or click does not prove a purchase.
See the [known limits and platform contracts](docs/DEVELOPMENT.md#native-reads)
and [release notes](docs/RELEASE-NOTES.md).

## Local data and backups

Keep `.community-state/` and `.env.local` private and back them up securely.
They contain encrypted store data, operational state and installation credentials.
Never commit them or attach them to an issue. Losing them may require reconnecting
the installation. Do not share customer identities, raw carts or email contents
in public logs, issues or pull requests.

## Updating

Install only a newer signed release and read its release notes first. Stop the
running process, back up `.community-state/` and `.env.local`, then follow
[update and recovery instructions](docs/RECOVERY.md), including launcher updates.
A successful update does not certify a preview as stable. The
[stable release criteria](docs/STABLE-RELEASE.md) remain separate.

## Stopping or uninstalling Community

For `npm start`, press **Ctrl+C** in its terminal. To uninstall, stop the service,
preserve private state if needed, and follow the
[uninstall guide — English / français](docs/UNINSTALL.md). Uninstalling Community
does not cancel your subscription or remove the store connector.

## Help and security

Run `npm run doctor` to check installation requirements and configuration. For a
store connection issue, check **Sync health** and the connector's own diagnostic.
Report reproducible issues with the Community version, connector version and a
sanitized error message. Never include credentials or customer data.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
Only this repository's verified signed releases are official NeuroCheckout builds.

## Development and contributions

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process and
[development documentation](docs/DEVELOPMENT.md) for public integration contracts
and validation commands.

## License and trademark

The source code is licensed under [Apache License 2.0](LICENSE). The NeuroCheckout
name and visual identity remain protected; see [TRADEMARKS.md](TRADEMARKS.md) and
[BRAND-ASSETS-LICENSE.md](BRAND-ASSETS-LICENSE.md).
