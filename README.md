# NeuroCheckout Community

NeuroCheckout Community is the official self-hosted dashboard for connecting an
online store to NeuroCheckout Cloud. Product and cart details are kept in an
encrypted local vault, while agents, scheduling, quotas and email delivery are
managed by NeuroCheckout Cloud.

Official repository: https://github.com/pisob/neurocheckout-community

## Requirements

- Linux or macOS;
- Node.js 22.13 or newer;
- npm 10 or newer;
- Git and GnuPG 2.x;
- an active NeuroCheckout account and a Community Client ID;
- continuous outbound HTTPS access while NeuroCheckout is operating.

No inbound Internet port is required for a localhost installation. The computer
or server hosting Community must remain online. If it becomes unavailable,
dependent actions pause safely and resume automatically after reconnection.

## Install an official preview

Open the [official releases](https://github.com/pisob/neurocheckout-community/releases)
and note the latest tag. The example below uses `v0.1.0-preview.10`:

```bash
git clone --branch v0.1.0-preview.10 --depth 1 \
  https://github.com/pisob/neurocheckout-community.git
cd neurocheckout-community
```

The detached-HEAD message is expected because an immutable release tag is being
installed.

Verify the tag before running project scripts:

```bash
verification_home="$(mktemp -d)"
chmod 700 "${verification_home}"
GNUPGHOME="${verification_home}" gpg --batch --import RELEASE-PUBLIC-KEY.asc
GNUPGHOME="${verification_home}" gpg --batch --fingerprint \
  2949F3BB3295DB8DD776CC8DCEBA4BC1483B4BB0
GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.10
find "${verification_home}" -depth -delete
unset verification_home
```

Continue only if the fingerprint is exactly
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0` and Git reports a good
signature from `NeuroCheckout Community Release <contact@neurocheckout.com>`.
A trust warning is normal after importing a key for the first time; a bad
signature is not.

Run the guided setup using the public Client ID and callback URL shown in your
NeuroCheckout account:

```bash
npm run setup -- --environment=preview
npm run install:native
npm start
```

Open http://localhost:3400 and select **Connect to Cloud**. After connection,
Community automatically creates its encrypted local vault and starts product and
cart synchronization for the eligible store. No additional synchronization
secret, server file or SSH access is required.

## Connect an ecommerce platform

Install the official connector for your platform and follow its README:

- [PrestaShop](https://github.com/pisob/neurocheckout-connector-prestashop)
- [Magento](https://github.com/pisob/neurocheckout-connector-magento)
- [WooCommerce](https://github.com/pisob/neurocheckout-connector-woocommerce)

Use only connector packages published under **Releases**. GitHub's
**Code → Download ZIP** archive contains development sources and is not an
installable module package.

## Local data and backups

The `.community-state/` directory contains encrypted store data and operational
state. Keep it private, back it up securely and never commit it. The `.env.local`
file contains installation credentials and must also remain private. Losing both
may require reconnecting the installation.

Customer contact details, raw carts, product records and email contents must not
be copied into issues, logs or pull requests.

## Updating

Install only a newer signed release. Read its release notes, verify the tag and
assets, stop the running process, back up `.community-state/` and `.env.local`,
then follow the update instructions displayed by Community.

## Development and contributions

```bash
npm ci
npm run typecheck
npm run test:native
npm run test:local-data
npm run test:source-pull
npm run test:relay
npm run build
```

Contributions are proposed through pull requests and are never published
automatically. Official releases are reviewed, tagged and signed by authorized
maintainers. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md).

## Security and official distribution

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
This repository, its signed tags and its release assets are the canonical
distribution channel. Forks and modified builds are not official NeuroCheckout
releases.

## License and trademark

The source code is licensed under Apache License 2.0. The NeuroCheckout name,
logos and other brand assets remain protected and may not be used to imply that
a modified distribution is an official release.
