# Changelog

All notable changes to NeuroCheckout Community are documented in this file.

## Unreleased

### Changed

- Reworked the dashboard into five focused operational views instead of one
  continuous page.
- Aligned the complete interface with the NeuroCheckout dark-blue visual
  system and blue action color.
- Split shop, email-template, OpenAI BYOK and connector configuration into
  dedicated tools with responsive navigation and reduced-motion support.

## 0.1.0-preview.1 - 2026-08-29

Initial public technical preview.

### Included

- Self-hosted member dashboard connected to NeuroCheckout Cloud through OAuth
  2.0 Authorization Code with PKCE S256.
- Cloud-calculated plan, quota, feature and agent availability.
- Shop creation, versioned email templates, encrypted OpenAI BYOK
  configuration and connector-key rotation.
- Encrypted HTTP-only local session with rotating Cloud refresh tokens.
- Automated typecheck, production build, dependency audit, Dependabot, CodeQL,
  secret scanning and push protection.

### Security boundary

- Business rules, agent orchestration, quotas, delivery and sensitive customer
  processing remain private NeuroCheckout Cloud services.
- Community contains no Cloud service credential and receives only scoped,
  short-lived access tokens.

### Known limitations

- This is a technical preview, not a stable production release.
- A NeuroCheckout Cloud account and registered Community installation are
  required for authenticated functionality.
- Commerce connector artifacts remain unavailable until their compatibility
  entries are explicitly marked `release_ready: true`.
- Production installations require HTTPS, an exact OAuth callback and a unique
  session secret of at least 32 random characters.
