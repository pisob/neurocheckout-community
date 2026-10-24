# Developing NeuroCheckout Community

This document describes the public Community client and connector contracts.
For installation and daily use, start with the [README](../README.md) and
[user guide](USER_GUIDE.md). Follow [CONTRIBUTING.md](../CONTRIBUTING.md) before
submitting changes.

## Scope and privacy

Community provides the self-hosted interface, encrypted local storage and
authenticated transport. It does not select marketing audiences, calculate
recipient prices or authorize email delivery. Account permissions, quotas and
available services are confirmed by NeuroCheckout Cloud.

Keep Cloud implementation details, deployment procedures, credentials and real
customer evidence out of this repository. Public examples and tests use synthetic
data. Protocol documentation, public signing keys and OAuth Client IDs are public
interfaces; they do not replace authentication or authorization.

## Source synchronization and catalog reads

The source transport uses the configured public HTTPS connector endpoint and
authenticated responses. It supports public IPv4 and IPv6; private addresses,
redirects and unverified replies are refused. Commands cannot choose a different
source URL.

A routine refresh can retain the last complete snapshot within its original
60-second freshness limit. Starting a refresh does not extend that limit.
Partial data, source changes, failed pulls and abandoned leases block reads until
synchronization completes.

Catalog pagination returns products without cart or customer records. Signed
continuation tokens expire after two minutes, are bound to the shop and
installation, and become invalid when the catalog changes. Product records remain
encrypted at rest; transporting a catalog does not authorize a recommendation.

## Native reads

Each native read uses the configured source, fresh nonces and request-bound
signatures. The platform, store and registered account must match. Changed source
credentials or installation identity, stale data, replay and incomplete responses
make a read unavailable. Unavailable prices are never replaced by generic catalog
prices, and incomplete history is never treated as an empty successful history.

| Read | Bounds and semantics |
| --- | --- |
| Account carts | Persisted nonempty carts for the registered account; six-second deadline, 4 KiB reply, 15-second freshness. Anonymous carts and uncommitted browser changes are outside the contract. |
| Recipient prices | Up to 16 exact products; six-second deadline, 16 KiB reply, 15-second freshness. Preserve currency precision, native tax display and platform context. PrestaShop also preserves the default combination. |
| Magento history | Up to 128 orders, 512 lines and 64 KiB; six-second deadline and exact store, website and account binding. Preserve payment/refund facts and unknown values. |
| WooCommerce history | Up to 128 orders, 128 refunds, 512 lines and 64,000 bytes. Preserve posts/HPOS facts, unknown paid dates and original/refund line relationships. |
| PrestaShop history | Up to 128 orders/payments/credit notes, 512 combined lines and 64,000 bytes. Preserve shared-payment relationships and native timestamps; credit notes are not proof of bank refunds. |

Native cart and price facts remain transient. An on-demand history read does not
write to the catalog or outbox. The scheduled local-history process separately
stores completed account histories in the encrypted vault.

The `customer_history_index` operation discovers registered accounts with orders
in pages of eight, using a fixed account-ID ceiling for a consistent pass.
The initial pass follows complete source synchronization; later passes are due
seven days after completion. Failed accounts retain their cursor for retry.
Guest orders are excluded. Cache limits are 10,000 accounts / 128 MiB, with expiry
30 days after the last successful refresh. Access does not renew that timestamp.

Diagnostics expose `order_history.completeAt`, `nextDueAt`, `accounts` and
sanitized errors. Completion receipts report the original finish and next due
time and account count without exporting order or customer contents. Partial or
failed passes cannot report success. Neither a heartbeat nor cached history
substitutes for current consent, price, stock or cart checks.

## Email originals and approvals

The encrypted archive retains immutable originals, including language and template
variant. A preview requires matching shop, installation, signature and delivery
identity. Approval refers to the signed original rather than editable HTML.
A cart original cannot stand in for a recommendation original with the same ID.

Recommendation originals may contain signed selected-product context. Schema 2
adds an opaque offer fingerprint covering price, variant, name, link, currency
and display precision. Community validates, encrypts and transports it. Schema 1
remains readable for history but cannot establish schema-2 price revalidation.
Retries never upgrade or regenerate an already archived copy.

Archive bounds are 50 recent confirmed originals, plus up to 50 originals marked
converted when reading history, expiring after 30 days. Up to 100 unconfirmed
preparations expire after 24 hours. Missing originals remain unavailable.

Embedded previews remove scripts, links, tracking pixels and images with query
strings. Supported HTTPS raster images remain visible. Opening an original
recovery link is an explicit action that may count as a click; previewing an email
does not prove an open, purchase or payment. Partial delivery history leaves
totals unknown rather than reporting zero. Retrying history does not resend mail.

## Validation

Run the documented checks for the changed component. The repository's CI also
validates TypeScript, a production build, browser journeys, packaging and the
production dependency audit. Useful local checks include:

```bash
npm ci
npm run typecheck
npm run test:native
npm run test:local-data
npm run test:source-pull
npm run test:relay
npm run test:email-archive
npm run test:email-history
npm run build
npm run smoke:integration
```

Use synthetic fixtures and isolated installations. Passing transport tests does
not establish successful real-store installation, inbox delivery or merchant
acceptance. Public [stable release criteria](STABLE-RELEASE.md) and
[signed release verification](../RELEASES.md) remain separate requirements.
