import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NC_PLAYWRIGHT_MODULE || "@playwright/test");
const origin = "http://127.0.0.1:13424";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "13424"], {
  stdio: "ignore", env: { ...process.env, NC_DEPLOYMENT_ENV: "test", NC_LOCAL_DATA_PILOT_ENABLED: "false", NC_CONNECTOR_PULL_ENABLED: "false", NC_COMMUNITY_AVAILABILITY_ENABLED: "false" },
});
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  for (const scenario of ["starter", "pro", "upgrade", "portal", "untrusted", "error"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const mutations = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://billing.example.test/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Billing destination</h1>" }));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let body = {};
      let status = 200;
      if (path.endsWith("/capabilities")) {
        body = {
          schema_version: "1.1",
          manifest: scenario === "untrusted" ? null : { version: "test", authority: "neurocheckout_cloud", deny_by_default: true, refresh_after_seconds: 60 },
          plan: { code: ["portal", "upgrade"].includes(scenario) ? "starter" : "community", edition: "community" },
          subscription: { status: scenario === "portal" ? "paid_active" : "free_active", active: true, can_manage_billing: scenario === "portal" },
          limits: { shops: 1, active_agents: 8, emails: { limit: 100, used: 0, remaining: 100 } },
          features: { member_dashboard: true }, agents: { available: [], coordination_enabled: true },
          dashboard: { update_required: false, update_recommended: false }, connectors: [],
          upgrade: { available: scenario !== "portal", action: scenario === "upgrade" ? "upgrade" : "checkout", target_plans: scenario === "upgrade" ? ["pro"] : ["starter", "pro"] },
        };
      } else if (path.endsWith("/setup")) {
        body = { enabled: true, configured: true };
      } else if (path.endsWith("/subscription/preview")) {
        const query = new URL(request.url()).searchParams;
        body = { plan_code: query.get("plan_code"), billing_cycle: query.get("billing_cycle"), amount: 123.45, currency: "USD", tax_behavior: "exclusive", limits: { shops: 4, agents: 8, emails: 1000 } };
        if (scenario === "error") { status = 503; body = { detail: "private_exception_not_for_display" }; }
      } else if (path.includes("/subscription/") && request.method() === "POST") {
        mutations.push({ path, body: request.postDataJSON() });
        if (scenario === "error") { status = 503; body = { detail: "billing_unavailable" }; }
        else body = { checkout_url: "https://billing.example.test/checkout", portal_url: "https://billing.example.test/portal" };
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin + "/?connected=1#features");
    await page.getByRole("button", { name: "Refresh entitlements", exact: true }).waitFor();
    if (scenario === "pro") await page.locator(".subscription-controls select").first().selectOption("pro");
    const button = scenario === "portal"
      ? page.getByRole("button", { name: "Change plan — Upgrade / Downgrade", exact: true })
      : page.getByRole("button", { name: ["pro", "upgrade"].includes(scenario) ? "Upgrade to Pro" : "Upgrade to Starter", exact: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile overflow");
    if (scenario === "untrusted") {
      assert(await button.isDisabled());
      assert.equal(mutations.length, 0);
    } else {
      await button.click();
      await page.getByRole("dialog").waitFor();
      assert.equal(mutations.length, 0, "Opening the review must not change billing");
      await page.getByRole("button", { name: "Not now", exact: true }).click();
      assert.equal(mutations.length, 0, "Cancelling the review must not change billing");
      await button.click();
      if (scenario !== "portal") await page.getByText("Paid subscription, without a new 30-day trial.", { exact: false }).waitFor();
      if (scenario === "error") {
        await page.getByText("The current price could not be verified.", { exact: false }).waitFor();
        assert(!(await page.locator('body').innerText()).includes('private_exception'));
      } else {
        await page.getByText('Recurring base price : $123.45 / month', { exact: true }).waitFor();
        await page.getByText('New limits : 4 stores · 8 agents · 1000 emails per month', { exact: true }).waitFor();
      }
      await page.getByRole("button", { name: "Continue to secure billing", exact: true }).click();
      if (scenario === "error") {
        await page.locator(".config-error[role=alert]").last().waitFor();
        await page.waitForFunction(() => !document.querySelector(".subscription-actions .primary").disabled);
        assert(page.url().startsWith(origin));
      } else {
        await page.waitForURL("https://billing.example.test/**");
        if (scenario === "portal") assert.deepEqual(mutations.map(x => x.path), ["/api/cloud/subscription/portal"]);
        else if (scenario === "upgrade") assert.deepEqual(mutations.map(x => x.path), ["/api/cloud/subscription/upgrade"]);
        else {
          assert.deepEqual(mutations.map(x => x.path), ["/api/cloud/subscription/select-plan", "/api/cloud/subscription/checkout"]);
          assert.equal(mutations[0].body.plan_code, scenario);
          assert.equal(mutations[1].body.billing_cycle, "monthly");
          assert(mutations[1].body.intent_id);
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS browser click:", scenario);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}
