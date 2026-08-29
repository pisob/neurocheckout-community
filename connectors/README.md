# NeuroCheckout Community connectors

The commerce connectors may be released as separate open-source packages. They
only collect and forward the events required by the documented Community API;
the decision engine, agent orchestration, customer scoring and delivery logic
remain NeuroCheckout Cloud services.

## Release boundary

Every connector release must be assembled from an explicit inclusion manifest.
Never export a private repository, its Git history, build cache, local
configuration, credentials, logs or fixtures containing customer data.

A connector is publishable only after all of these checks are complete:

1. platform-specific source and dependency security review;
2. data minimisation and consent review against the current DPA;
3. retry queue bounded to 48 hours, idempotency keys and priority ordering for
   orders and support events;
4. compatibility test against the public Community OpenAPI contract;
5. reproducible archive, SHA-256 checksum and maintainer signature;
6. installation, upgrade, key rotation and uninstall tests on every supported
   platform version.

[`compatibility.json`](compatibility.json) is deliberately fail-closed. A
platform must remain `release_ready: false` until its audited source package,
tested version range and signed artifact are available.

## Build an audited release

Copy `connector-files.example.txt`, list only reviewed source files, then run:

```bash
./tools/build-connector-release.sh \
  /absolute/path/to/reviewed-connector-source \
  /absolute/path/to/connector-files.txt \
  /absolute/path/to/release-output \
  woocommerce \
  1.0.0
```

Set `NC_CONNECTOR_MINISIGN_KEY_PATH` to an explicit private-key path to add a
`.minisig` signature. Signing is intentionally unavailable when `minisign` or
the key is absent; the script never generates or searches for private keys.
