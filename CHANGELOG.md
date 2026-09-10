# Changelog

All notable changes to NeuroCheckout Community are documented in this file.

## Unreleased

No unreleased changes.

## 0.1.0-preview.5 - 2026-09-10

- Signed staging prerelease with an explicit `setup --environment=staging`
  path, staging account links and a Mailpit cart-recovery test checklist.
- Include persistent server availability, an encrypted local product/cart
  vault, signed source synchronization and an outbound-only Cloud read client.
- Preserve the requirement that agents, scheduling, quotas and SMTP run in Cloud.
- Validate restart recovery, replay protection, bounded storage and signed
  source batches; fix an integration-test race between heartbeat and relay.
- Keep local-data/source-pull pilots disabled. Native connector exports,
  minimal event delivery, real-store checks and all Cloud business readers
  are not yet complete. Existing Cloud data is not migrated or deleted.
- Not approved for production; no new connector package is declared released.

## 0.1.0-preview.4 - 2026-09-08

- Add a secure update button for native Linux installations started with npm.
- Validate the Cloud-authorized target, official tag, pinned OpenPGP signer,
  archive checksum and equality with the signed Git tree before building.
- Prepare updates separately, preserve the original environment file, check
  startup health and restore the previous build when activation fails.
- Show progress in English and French and link Docker users to manual updates.
- Protect local update requests with session authentication, origin checks and
  an exclusive request queue; dependency builds receive no application secrets.

## 0.1.0-preview.3 - 2026-09-07

### Fixed

- Send the version from `package.json` to NeuroCheckout Cloud instead of a
  stale hard-coded preview number, preventing false update notifications.
- Keep the Docker image tag aligned with the package release version.

### Changed

- Make the end-user installation path clone and verify the immutable signed
  release tag before running setup or installing dependencies.
- Replace branch-based upgrades with explicit signed-tag verification and keep
  the published release-key fingerprint enforced by CI.

## 0.1.0-preview.2 - 2026-09-07

### Changed

- Declare the single canonical repository in the README, security policy and
  trademark policy so forks and mirrors cannot be mistaken for official builds.
- Clarify that contributions and CI artifacts remain unofficial until reviewed,
  merged and published through the maintainer-only signed-release process.
- Require every future official dashboard release to use a signed Git tag, a
  reproducible archive, a published SHA-256 checksum and an OpenPGP signature.
- Publish the dedicated release-verification key and local verification tool;
  the private signing key remains outside Git and the public signing identity
  uses the existing `contact@neurocheckout.com` mailbox.
- Require connector release signatures and immediate Minisign verification
  instead of allowing unsigned connector release archives.
- Support encrypted OpenAI and Anthropic BYOK keys with an explicit active AI
  provider per shop; NeuroCheckout platform credentials are never exposed or
  substituted in Community generation.
- Add a privacy-safe journal of the latest 10 emails sent to the Orders & emails view.
- Make English the default Community interface language, with an EN/FR switch
  that remembers the operator's explicit choice independently from email language.
- Default new email editorial profiles to English and allow merchants to add
  missing locale codes that remain available in the language selector.
- Replace the single-template email editor with controlled brand and editorial
  rules and a three-direction preview powered by the shop's selected encrypted
  AI provider key. Cloud orchestration details remain private.
- Reworked the dashboard into five focused operational views instead of one
  continuous page.
- Aligned the complete interface with the NeuroCheckout dark-blue visual
  system and blue action color.
- Split shop, email-template, AI-provider BYOK and connector configuration into
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
