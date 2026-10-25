# Sponsors and voluntary support

Community can display one clearly labelled sponsored placement below the language
and account header on every page, plus a voluntary support section in Plan & data.
A compact support button also
stays at the bottom of the sidebar on every page, even when the menu is collapsed,
with an explanation of how contributions support the project above the button.
Both support buttons share the same verified Stripe flow. These placements are
controlled by the Cloud and are off until an administrator configures and enables them.

Only accounts with a confirmed **free Community plan** are eligible. Starter,
Pro, Enterprise and trial accounts see neither placement, even when they use the
self-hosted Community application. An upgrade removes the placements after the
Cloud confirms the new entitlement; reinstalling is not required.

Funding does not change quotas, features, email delivery or synchronization.
Unknown/stale entitlements, an unavailable funding API or expired content hide
the optional placements. There is no persistent advertising cache or third-party
script, pixel, third-party-hosted creative or impression counter. No store/customer/vault
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

## Optional sponsor images

Administrators may upload JPG/PNG/static WebP or animated GIF/WebP in the Cloud
funding backoffice. Importing does not enable or publish a campaign: save the
configuration separately. Images have French/English alternative text and open
the same validated destination as the sponsor button. They are displayed without
cropping, with a pause/play control. Reduced-motion preferences select a separate
static poster; preferences are honored immediately, including changes at runtime.
An image failure leaves sponsor text and its CTA available. Paid plans still load
neither the placement nor its image. No change to donation eligibility or payments.

Cloud validates and re-encodes uploads, stores them durably and supplies a
content-addressed reference (not an arbitrary image URL). The local proxy accepts
only a 64-character SHA-256 identifier and `image.webp` or `poster.webp`. It calls
only the configured Cloud public media endpoint, without cookies, authorization
or referrer, rejects redirects/oversized/non-WebP responses, and caches immutable
image bytes for one day. This binary cache never authorizes showing a placement:
fresh free entitlements and the short-lived funding response remain required.

Cloud upload limits: 5 MiB, 2048 px per edge, 120 frames, 24 million decoded pixels
and 60 seconds per animation cycle; static poster at most 1 MiB. Original image
metadata is removed. Existing text-only campaigns and old Cloud responses work
unchanged. Deploy the Cloud media migration and API before releasing this client.

Tests: `npm run test:funding`, then build and `npm run test:funding-ui`.
