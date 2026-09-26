# NeuroCheckout Community

NeuroCheckout Community is the official self-hosted dashboard for connecting an
online store to NeuroCheckout Cloud. Product and cart details are kept in an
encrypted local vault, while enabled services are provided through an
authenticated NeuroCheckout connection.

Official repository: https://github.com/pisob/neurocheckout-community

## Requirements

- Linux or macOS;
- Node.js 22.13 or newer;
- npm 10 or newer;
- Git and GnuPG 2.x;
- a NeuroCheckout account and a Community Client ID, obtained in steps 1–2 below;
- continuous outbound HTTPS access while NeuroCheckout is operating.

No inbound Internet port is required for a localhost installation. The computer
or server hosting Community must remain online. If it becomes unavailable,
dependent actions pause safely and resume automatically after reconnection.

## 1. Create your Cloud account before installing Community

The commands below use `--environment=preview`, which connects to **Cloud
staging**, not production. First confirm that you have authorized staging access.
If access is refused, stop here and request access from NeuroCheckout; installing
Community does not grant access to staging.

1. [Create your staging account](https://staging.neurocheckout.com/register), or
   [sign in to staging](https://staging.neurocheckout.com/login) if you already
   have one. Verify your email if requested.
2. For a new free account, open [plan selection](https://staging.neurocheckout.com/onboarding/subscription)
   and choose **Activate Community** / **Continue free with Community**.
   This free activation does not require Stripe checkout or a payment card.
   **Already subscribed or in an active trial? Keep that plan; skip free activation.**
3. In the Cloud dashboard, create or select the store that Community will manage.

For production, use your account at `https://www.neurocheckout.com`, an authorized
release and the [production instructions](docs/INSTALLATION.md). Do not mix a
production Client ID with preview setup. Accounts and installations must belong
to the environment you connect to.

## 2. Register your installation and copy its public Client ID

Community does **not** need to be installed or running for this step.

1. Open [Community installations in staging](https://staging.neurocheckout.com/dashboard/community).
2. Create an installation for your store and give it a recognizable name.
3. For this local installation, register the exact callback URL:
   `http://localhost:3400/api/auth/callback`.
4. Copy the installation's **Client ID** (beginning with `nc_`). Keep it available
   for step 4. For an existing installation, use its existing Client ID rather
   than creating a duplicate for the same store.

**What is “Public Cloud client ID”?** It is the public OAuth identifier of your
Community installation, not a password, connector API key, signing key or MCP
server. It identifies the installation; you still sign in and authorize access
in the browser. You do not create this identifier yourself.

Before continuing, you must have **both your Client ID and the exact callback
URL**, from the same Cloud environment.

## 3. Download and verify an official preview

Open the [official releases](https://github.com/pisob/neurocheckout-community/releases)
and note the latest tag. The example below uses `v0.1.0-preview.23`:

```bash
git clone --branch v0.1.0-preview.23 --depth 1 \
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
GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.23
find "${verification_home}" -depth -delete
unset verification_home
```

Continue only if the fingerprint is exactly
`2949 F3BB 3295 DB8D D776 CC8D CEBA 4BC1 483B 4BB0` and Git reports a good
signature from `NeuroCheckout Community Release <contact@neurocheckout.com>`.
A trust warning is normal after importing a key for the first time; a bad
signature is not.

## 4. Configure, install and start Community

Run the guided setup from the `neurocheckout-community` directory:

```bash
npm run setup -- --environment=preview
```

When prompted:

- **Public Cloud client ID:** paste the Client ID copied in step 2, then press Enter.
- **Exact callback URL:** enter `http://localhost:3400/api/auth/callback`, exactly
  as registered in Cloud, then press Enter.

If you are already stuck at the Client ID prompt, you can leave that terminal
open, complete steps 1–2 in your browser, then return and paste the identifier.
Do not enter your password, an API key or an MCP URL.

After setup succeeds, run:

```bash
npm run install:native
npm start
```

## 5. Connect your installation to Cloud

Open http://localhost:3400 and select **Connect to Cloud**. After connection,
Community automatically creates its encrypted local vault and starts product and
cart synchronization for the eligible store. No additional synchronization
secret, server file or SSH access is required.

Use the same staging account that owns the installation. Check your store and
**Sync health**. If the store connector is not configured yet, follow
[Connect an ecommerce platform](#connect-an-ecommerce-platform) below.

## Plans, billing and continuity

Community remains your self-hosted interface on Community Free, Starter and
Pro. Open **Plan & data** to compare an eligible plan, start the secure checkout,
manage billing and refresh the Cloud-calculated entitlements. After checkout,
the browser returns to the same registered Community installation; the Cloud
validates that return origin against the installation's OAuth callback.

Changing, cancelling or temporarily suspending a plan does not delete the
encrypted local vault, connector configuration or backups. Access to paid
features follows the permissions verified for the current account. Internal
service architecture, operational identifiers and raw service errors are not
displayed by Community.

If payment is suspended, Community keeps only the capabilities and billing
portal routes required to restore payment. If a subscription expires or is
cancelled, it keeps only the exact billing recovery routes needed: an existing
Stripe subscription returns through the billing portal, while an account with
no active Stripe subscription can select a plan and reopen checkout. Agent,
analytics and store-data APIs remain closed until Cloud confirms reactivation.
Checkout attempts are idempotent. Community shares the non-secret checkout
intent between tabs and reuses the same session; a second concurrent checkout
for the same account is refused.

This subscription flow uses the narrowly scoped `billing:write` OAuth
permission. After updating from a release that did not request this permission,
disconnect and reconnect the installation once before starting or managing a
subscription from Community.

## Partner program

When the Cloud capability is enabled, open **Partner program** to submit an
application, copy an approved referral link, review attributed stores and
commissions, connect Stripe and request a payout. Partner attribution,
commission validation and payout approval remain authoritative in
NeuroCheckout Cloud.

Community receives only the account's member-facing partner evidence. Payment
account identifiers, internal record identifiers, customer contact details and
private metadata are excluded. The feature uses separate `partners:read` and
`partners:write` OAuth permissions. After upgrading from an older release,
disconnect and reconnect once to grant these permissions.

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
npm run smoke:integration
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

### Sent email activity

The email activity view keeps a filterable, paginated record of up to 50 recent
sends. For the latest ten confirmed sends it also shows, when available, the
original HTML or text copy stored in your encrypted local archive. Select an
email to inspect it, or choose **Full preview** to enlarge it. HTTPS raster product
images are displayed. Scripts, links, tracking pixels and images with query strings
are blocked inside the embedded preview. Choose **Open original cart link** to
open the email's recovery link in a new tab. This explicit action may count as
an email click. Historical copies retain their original content and links.

Email preparation, agents and delivery remain Cloud responsibilities. Supported
deliveries archive a Cloud-authenticated copy locally before sending; a failed
archive blocks the send rather than losing the original content. Sent copies are
limited to ten and expire after 30 days. Unconfirmed preparations are bounded to
100 and expire after 24 hours. Include your private Community state in backups.

Older messages without a saved copy display **Preview unavailable**. An absent
opening, click or conversion record is not inferred from viewing the preview.
This feature does not add tracking to delivery paths that do not support it.
It requires matching Community and Cloud support; it is not activated by this
documentation alone.

### Synchronization health

The synchronization-health workspace reports connector freshness, encrypted
local outbox acknowledgements, Cloud processing queues and delivery evidence.
Temporary network or Cloud failures are retried automatically. The manual retry
action only wakes the same idempotent reconciliation loops; it does not duplicate
events or bypass validation. Operational diagnostics never expose raw cart,
product or customer payloads.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
This repository, its signed tags and its release assets are the canonical
distribution channel. Forks and modified builds are not official NeuroCheckout
releases.

## License and trademark

The source code is licensed under Apache License 2.0. The NeuroCheckout name,
logos and other brand assets remain protected and may not be used to imply that
a modified distribution is an official release.
