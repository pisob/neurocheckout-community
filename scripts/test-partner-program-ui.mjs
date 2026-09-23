import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NC_PLAYWRIGHT_MODULE || "@playwright/test");
const port = Number(process.env.NC_TEST_PORT || 13403);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  stdio: "ignore",
  env: { ...process.env, NC_DEPLOYMENT_ENV: "test", NC_LOCAL_DATA_PILOT_ENABLED: "false", NC_CONNECTOR_PULL_ENABLED: "false", NC_COMMUNITY_AVAILABILITY_ENABLED: "false" },
});

let browser;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path.endsWith("/capabilities")) {
      body = {
        schema_version: "1.1",
        manifest: { version: "test", authority: "neurocheckout_cloud", deny_by_default: true, refresh_after_seconds: 60 },
        plan: { code: "community", edition: "community" },
        subscription: { status: "free_active", active: true },
        limits: { shops: 1, active_agents: 8, emails: { limit: 100, used: 2, remaining: 98 } },
        features: { member_dashboard: true, partner_program: true },
        agents: { available: [], coordination_enabled: true },
        dashboard: { update_required: false, update_recommended: false },
        upgrade: { available: false },
        connectors: [],
      };
    } else if (path.endsWith("/partner")) {
      body = {
        exists: true,
        affiliate: { code: "SAFE25", referral_url: "https://staging.neurocheckout.com/r/SAFE25", status: "active", code_status: "active", commission_rate_bps: 2500, commission_months: 12, stripe_payouts_enabled: true, stripe_details_submitted: true },
        stats: { clicks_30d: 4, clicks_total: 9, referrals_total: 3, converted_total: 2, pending_cents: 1200, approved_cents: 6000, paid_cents: 5000, available_payout_cents: 6000 },
        payout_minimum_cents: 5000,
        referred_sites: [{ display_name: "Safe Shop", platform: "prestashop", referral_status: "converted", converted_at: "2026-09-23T08:00:00Z" }],
        referred_sites_page: 1,
        referred_sites_total: 1,
        referred_sites_total_pages: 1,
        recent_payouts: [{ amount_cents: 5000, currency: "usd", status: "paid", paid_at: "2026-09-22T08:00:00Z" }],
        recent_payout_requests: [],
        open_payout_request: null,
      };
    } else if (path.endsWith("/setup")) {
      body = { enabled: true, configured: true, source_pull_configured: true };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto(`${origin}/?connected=1#partner-program`);
  await page.getByRole("heading", { name: "Partner control center", exact: true }).waitFor();
  await page.getByText("https://staging.neurocheckout.com/r/SAFE25", { exact: true }).waitFor();
  await page.getByText("Safe Shop", { exact: true }).waitFor();
  assert.equal(await page.getByText("acct_secret", { exact: false }).count(), 0);
  assert.equal(await page.getByText("partner@example.com", { exact: false }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Request payout" }).isEnabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("Partner workspace desktop/mobile and public-data minimization passed.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}
