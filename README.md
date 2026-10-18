# NeuroCheckout Community

## Native recommendation contracts (preview.43)

Relay native history v1/v2 without rewriting the signed facts. History v2 carries
nullable native discounts so Cloud can qualify promotion affinity; unknown stays
unknown. Native account carts, recipient prices, consent and order histories use
the same bounded signed source transport. No new private snapshot or consent
change is introduced. Cloud now has a dedicated campaign/approval/send worker;
installing this dashboard does not itself enable campaigns. Live acceptance and
Cloud activation remain separate from local fixture validation.

## Native account-cart reads (candidate, 2026-10-18)

The authenticated relay supports `read_customer_carts` for matching candidate
Cloud and PrestaShop/WooCommerce/Magento connectors. It reads signed native facts
for the exact registered account and shop/store view: completeness, consent,
read time and whether a persisted nonempty cart exists. Facts stay in memory;
the reader does not store them in the vault, catalog or outbox, and does not
modify a cart or consent. Cloud owns the preparation and sending decisions.

Source reads use the configured HTTPS endpoint and secret, fresh nonces and
request-bound signatures, a six-second deadline, a 4 KiB response limit and
15-second fact freshness. A changed source/key/installation, stale synchronization,
wrong platform/scope, replay, incomplete reply or unavailable connector blocks
the read. Commands cannot supply an endpoint. Preview.43 includes this operation; use matching PrestaShop 4.6.11,
WooCommerce 1.0.13 and Magento 1.0.10 connectors with the coordinated Cloud upgrade.

Coverage is persisted account carts; anonymous carts and uncommitted browser
changes remain outside this contract. It does not enable independent campaigns
or provide final coordination with checkout before email sending. `npm run
test:relay` includes 33 new three-platform cases (71 relay tests total), covering
signed transport, actual relay dispatch, refusal boundaries and no persistence.
Live installed-store HTTP and real recommendation delivery remain separate gates.

Connector-key creation and rotation require review of the currently published
Cloud DPA. The displayed version, language and content fingerprint are submitted
with explicit consent. A changed or unavailable document blocks the operation;
it never substitutes a draft or a hardcoded acceptance. Existing connector keys
and synchronization are unchanged. This flow requires the corresponding Cloud
published-document endpoint. Tests: `test:connector-key-dpa` and
`test:connector-key-dpa-ui` (English and French, synthetic data).

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

The connector API test checks the store-to-Cloud connection. Also check
**Synchronization health** in Community: Community must be able to reach the
store's public HTTPS connector to keep its encrypted data up to date. The source
transport supports public IPv4 and IPv6 with automatic connection fallback;
private addresses, redirects and unverified responses remain blocked. A source
outage pauses dependent actions and is retried automatically without resetting
the installation or its credentials.

With matching Cloud support, the outgoing relay can read a complete local
product catalog in bounded pages rather than relying on a small sample. This
transport does not select products or make marketing decisions in Community.
The vault must be freshly synchronized; signed continuation tokens expire after
two minutes, are bound to the store and installation, and become invalid when
the catalog changes. Cart and customer records are not included in these pages.
Products remain encrypted at rest. This client capability alone does not enable
independent recommendation emails. Regression tests include a synthetic catalog
of 2,045 products, altered/expired cursors, source outages and store isolation
(`npm run test:local-data` and `npm run test:relay`).

The candidate can also relay a recipient-specific Magento price read on demand,
with matching connector and Cloud support. It uses only the already configured
signed HTTPS source, not a URL supplied by a command. Up to 16 exact products are
requested for the bound store, website, customer and currency. A request has a
six-second deadline and 16 KiB response limit; signatures, nonce/request binding,
15-second price freshness and unchanged source credentials/installation are
checked. Unsupported, stale or unavailable data is not replaced with a generic
catalog price. These prices remain transient and never enter the catalog or
outbox. Community only transports them; selection and sending remain Cloud
responsibilities. This capability alone does not activate recommendation emails.
Regression checks are included in `npm run test:relay` and `npm run test:source-pull`.

The same candidate transport supports recipient-specific WooCommerce prices,
with a separate exact site/account contract. The configured endpoint must match
the requested platform. Native tax display amounts, precision and context binding
stay intact; stale, incomplete, foreign or altered replies are refused. Prices
remain in memory, not in the catalog or outbox. Woo and Magento cannot substitute
for each other's contracts. `npm run test:relay` covers these boundaries; matching
connector/Cloud candidates and final sending-policy checks are still required.
This capability alone does not activate a recommendation campaign.

PrestaShop now has its own recipient-price contract through that same transient
transport. It preserves native tax display, currency precision and the exact
default combination. The configured source must match PrestaShop; foreign,
stale, incomplete or altered offers are unavailable, with no catalog-price
fallback. The same 16-product, 16 KiB and six-second request bounds apply.
Prices and account identity remain in memory. Tests in `npm run test:relay`
cover scope, replay, freshness, rounding and source/installation changes.
Matching connector and Cloud candidates are required; this transport does not
enable campaigns or authorize sending.

With matching services, the candidate also relays an on-demand native Magento
account order history. It uses the same configured signed source, current
installation and six-second deadline, with a 64 KiB response limit. The exact
store, website and account must match. Complete history is distinguished from
unavailable or partial data; payment/refund amounts and unknown values remain
native facts. More than 128 orders, 512 lines or the payload budget is refused,
not silently truncated. The result stays in memory, never in the catalog or
outbox. Community does not infer purchases, change consent or authorize emails.
Malformed, stale, replayed or foreign results and source/credential changes are
covered by `npm run test:relay`. This capability is not a completed recommendation
sender and does not by itself activate campaigns.

The same candidate transport now supports native WooCommerce account history,
with a separate strict site/account contract and posts/HPOS facts. It preserves
paid-date unknowns, refund amounts and original/refund line links without
reclassifying an order as paid. It refuses more than 128 orders, 128 refunds,
512 lines or 64,000 bytes; partial data never becomes a successful empty history.
WooCommerce commands cannot address a Magento source or vice versa. History stays
in memory and current source/installation bindings are checked before and after
the read. Tests are included in `npm run test:relay`; matching connector and Cloud
candidates are required. This does not activate marketing or change consent.

The same transient history read now supports PrestaShop with a separate exact
shop/account contract. It preserves native orders, credit notes and unique
shared-payment relationships without classifying credits as bank refunds or
allocating one payment to several orders. Local timestamps and the current
runtime timezone remain native facts, not asserted historic UTC. Limits are
128 orders/payments/credit notes, 512 combined lines and 64,000 bytes. Platform
mix-ups, altered responses, foreign relations, replay and binding changes fail
closed; no history enters the catalog/outbox. `npm run test:relay` covers this
contract. Matching connector and Cloud candidates are required; this remains
a preparation component, not a complete independent-email sender.

## 1. Create your Cloud account before installing Community

Follow these instructions to connect Community to `https://www.neurocheckout.com`.
Version **0.1.0-preview.43** supports store synchronization. It remains a
prerelease: back up your installation before updating and verify the connection
and synchronization of each store before enabling customer email automation.

1. [Create your account](https://www.neurocheckout.com/register), or
   [sign in](https://www.neurocheckout.com/login) if you already
   have one. Verify your email if requested.
2. For a new free account, open [plan selection](https://www.neurocheckout.com/onboarding/subscription)
   and choose **Activate Community** / **Continue free with Community**.
   This free activation does not require Stripe checkout or a payment card.
   **Already subscribed or in an active trial? Keep that plan; skip free activation.**
3. In the Cloud dashboard, create or select the store that Community will manage.

Use an official signed release and follow the [installation instructions](docs/INSTALLATION.md).
Use the Client ID registered in your NeuroCheckout account and keep the configured
Cloud address unchanged throughout installation.

## 2. Register your installation and copy its public Client ID

Community does **not** need to be installed or running for this step.

1. Open [Community installations](https://www.neurocheckout.com/dashboard/community).
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

### Exact callback URL: where will you install Community?

- **On your computer:** use `http://localhost:3400/api/auth/callback`.
- **On a server:** use the HTTPS address where you will open Community, then add
  `/api/auth/callback`. Example:
  `https://community.example.com/api/auth/callback` (replace the example domain
  with your own).

This is not your store address. After Cloud sign-in, your browser uses this
address to return to Community. Copy exactly the same URL into the setup
assistant.

## 3. Download and verify an official preview

Open the [official releases](https://github.com/pisob/neurocheckout-community/releases)
and note the latest tag. The example below uses `v0.1.0-preview.43`:

```bash
git clone --branch v0.1.0-preview.43 --depth 1 \
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
GNUPGHOME="${verification_home}" git verify-tag v0.1.0-preview.43
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
npm run setup -- --environment=production
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

Use the same production account that owns the installation. Check your store and
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

Read [update safety and recovery](docs/RECOVERY.md) before updating. A failed
candidate must not validate using another version's health response. The launcher
performs a private restore drill before activation and reports safe failure codes.
These protections require updating the launcher itself, not only the served build.

The [stable acceptance checklist](docs/STABLE-RELEASE.md) distinguishes production
connectivity from stable certification. The merchant journey still requires owner
acceptance; this work does not promote a preview to stable.

Install only a newer signed release. Read its release notes, verify the tag and
assets, stop the running process, back up `.community-state/` and `.env.local`,
then follow the update instructions displayed by Community.

## Stopping or uninstalling Community

For an installation started with `npm start`, press **Ctrl+C** in its terminal.
To uninstall, stop it, preserve `.community-state/` and `.env.local` if needed,
then move only its installation folder to the Trash. Uninstalling does not cancel
your subscription or remove your store connector.

Follow the [step-by-step uninstall guide (English / français)](docs/UNINSTALL.md)
for local installations, Linux services, Docker volumes and Cloud revocation.

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

For the configuration checklist, plan changes, updates and email history, read
the [user guide (English and French)](docs/USER_GUIDE.md).

### Sent email activity

The email activity view keeps a filterable, paginated record of up to 50 recent
sends. For the latest 50 confirmed sends it also shows, when available, the
original HTML or text copy stored in your encrypted local archive. Select an
email to inspect it, or choose **Full preview** to enlarge it. HTTPS raster product
images are displayed. Scripts, links, tracking pixels and images with query strings
are blocked inside the embedded preview. Choose **Open original cart link** to
open the email's recovery link in a new tab. This explicit action may count as
an email click. Historical copies retain their original content and links.

Email preparation, agents and delivery remain Cloud responsibilities. Supported
deliveries archive a Cloud-authenticated copy locally before sending; a failed
archive blocks the send rather than losing the original content. Sent copies are
limited to the latest 50, plus up to 50 copies identified as converted when
viewing their delivery history, and expire after 30 days. Unconfirmed preparations are bounded to
100 and expire after 24 hours. Include your private Community state in backups.

With matching Cloud support, **Email approvals** can display the exact encrypted
original for an independent product-recommendation email as well as a cart email.
Only a matching store, installation and copy signature can supply that preview.
Approving sends the signature, not editable email content. A recommendation copy
cannot be substituted with a cart copy that happens to have the same numeric ID.
New recommendation originals can include a signed list of the products selected
for that email. This information stays encrypted with the immutable original,
including through restart and backup. It lets matching Cloud support avoid
repeated recommendations; Community does not make marketing decisions from it.
The candidate also accepts schema-2 contexts with an opaque fingerprint for each
offer. Matching Cloud support can compare the original price, native variant,
name, link, currency and display precision when resuming an approved copy.
Community only validates, encrypts and transports this signed context. It does
not calculate prices or decide whether an email can be sent. Install the matching
Community support before Cloud starts preparing schema-2 originals.
Older originals remain unchanged. A missing or older copy without these facts
cannot establish a complete product history and may pause a new preparation.
Schema-1 contexts remain readable for history, but lack the offer fingerprint
needed for price revalidation; retries never upgrade or regenerate those copies.
Existing retention limits still apply. This capability does not activate
recommendation campaigns. Covered by `npm run test:email-archive`.

Missing originals remain unavailable and cannot be confirmed as archived. This
client-side compatibility also preserves the original template variant and
language during retries; an already archived copy is never overwritten by newly
generated content. It does not itself activate campaigns or email delivery.

The candidate also displays independently accepted recommendation deliveries in
**Orders & emails**, with their Cloud-recorded agent, DB variant, language and
open/click status. A local original is shown only when its store, installation,
signature, agent, variant and language all match that delivery. An uncertain send
is not an accepted delivery, and an open/click is not a conversion. Order attribution
for this candidate recommendation path remains unavailable and is labeled as such.
Recommendation product links are not labeled as cart-recovery links.

If Cloud reports a partial history, other available evidence remains visible but
totals become unknown (a dash), with an English/French warning and retry action.
No false empty-history message is shown. Retrying only reads history; it does not
resend emails or reconstruct missing originals. Older Cloud versions remain
compatible. Checks: `test:email-history`, `test:email-archive`, `test:journeys`,
`smoke:integration` and `smoke:workspace`, using synthetic records only.

Older messages without a saved copy display **Preview unavailable**. An absent
opening, click or conversion record is not inferred from viewing the preview.
This feature does not add tracking to delivery paths that do not support it.

The **Usage** view is a quota window, not the lifetime delivery count. On the
Community plan it includes sends and in-progress reservations over the last
24 hours. Updating the application does not reset the Cloud quota ledger.
When Cloud cannot confirm usage, the interface displays an unavailable value,
not zero. The delivery history and conversion evidence are independent of the
local original-copy retention period. A previously expired copy is not recreated
by an update; restore it from a matching private-state backup if available.

Cart reads include exact same-store product references, so Cloud can retrieve
product details even in large catalogs. An incomplete catalog defers sending
and appears in **Sync health**; keep Community and the connector synchronized.
Images must exist on the merchant site, and the recipient's email client may
still block remote images. Already-delivered messages are not rewritten.
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
