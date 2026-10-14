# Sponsors and voluntary support

Community can display one clearly labelled sponsored text placement in Overview
and a voluntary support section in Plan & data. Both are controlled by the Cloud
and are off until an administrator configures and enables them.

Only accounts with a confirmed **free Community plan** are eligible. Starter,
Pro, Enterprise and trial accounts see neither placement, even when they use the
self-hosted Community application. An upgrade removes the placements after the
Cloud confirms the new entitlement; reinstalling is not required.

Funding does not change quotas, features, email delivery or synchronization.
Unknown/stale entitlements, an unavailable funding API or expired content hide
the optional placements. There is no persistent advertising cache or third-party
script, pixel, remote creative or impression counter. No store/customer/vault
data is sent to sponsors. Sponsor links open only on a voluntary click and do not
send a referrer. Nothing is inserted into storefronts or customer emails.

Support is optional, one-time and pay-what-you-want through Stripe. The initial
button verifies availability; “Continue to Stripe” then opens the payment page.
It neither changes the subscription nor creates an automatic recurring payment.
Test accounts never fall back to real payments. Payment errors do not block the
application. No tax benefit is promised.

For developers: Cloud contract `/api/v1/member/community-funding` (GET) and
`/api/v1/member/community-funding/support` (POST), scope `account:read`. The latter
only returns a verified destination; it does not create a payment. Proxies use
the existing authenticated transport and mutation-origin protection. Client
validation rejects unsafe destinations and expired responses. Both the local
fresh entitlement check and the server free-plan check are required.

Tests: `npm run test:funding`, then build and `npm run test:funding-ui`.
