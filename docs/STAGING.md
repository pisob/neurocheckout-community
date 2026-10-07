# Staging — authorized tests only

Staging is separate from production. Use a staging account, Client ID and connector
key together; never copy production credentials, customer data or vaults into it.

- Account: https://staging.neurocheckout.com/register
- Login: https://staging.neurocheckout.com/login
- Plan: https://staging.neurocheckout.com/onboarding/subscription
- Installation: https://staging.neurocheckout.com/dashboard/community
- Connector API endpoint: https://community-api-staging.neurocheckout.com

Follow the installation guide with these staging links, then run:

```bash
npm run setup -- --environment=preview
```

The callback remains the address of your Community installation, for example
`http://localhost:3400/api/auth/callback`; it is not the Cloud or store address.
Do not change the environment of an existing vault to reuse it in production.
Use a separate installation directory and register a production installation.

Staging links in this guide, automated tests and explicit preview configuration
are intentional. They must not be globally replaced with production URLs.
