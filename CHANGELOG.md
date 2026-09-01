# Changelog

All notable changes to NeuroCheckout Community are documented in this file.

## Unreleased

### Changed

- Make English the default Community interface language, with an EN/FR switch
  that remembers the operator's explicit choice independently from email language.
- Default new email editorial profiles to English and allow merchants to add
  missing locale codes that remain available in the language selector.
- Replace the single-template email editor with controlled brand and editorial
  rules and a three-direction preview powered by the shop's encrypted OpenAI
  key. Cloud orchestration details remain private.
- Reworked the dashboard into five focused operational views instead of one
  continuous page.
- Aligned the complete interface with the NeuroCheckout dark-blue visual
  system and blue action color.
- Split shop, email-template, OpenAI BYOK and connector configuration into
  dedicated tools with responsive navigation and reduced-motion support.
- Display Supervisor as the coordination layer above the seven currently
  enabled specialist agents, while respecting Cloud runtime kill switches.
- Add Cloud-synchronized optimization recommendations and a scoped Supervisor
  automation control to the agent-performance workspace.
- Use the official NeuroCheckout neural-node logo in the Community navigation
  and browser icon.
- Add a production-oriented Docker Compose quick start, official Cloud endpoint
  defaults and a complete installation, upgrade and uninstall guide.
- Start local production builds through the generated Next.js standalone
  server instead of the incompatible `next start` command.
- Add a guided, Docker-free installation with automatic secret generation,
  runtime `.env.local` loading, Cloud diagnostics and a hardened systemd unit.
- Make native prerequisites, Cloud access, ports and hosted HTTPS requirements
  explicit before the installation steps.
- Document the complete Cloud account, free-plan activation, installation
  registration and public Client ID workflow with direct official links.

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
