import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/PlanAndData.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", output)(
  (name) => name === "@/lib/public-presentation"
    ? { publicErrorMessage: () => "", publicFeatureLabel: () => null }
    : require(name),
  module,
  module.exports,
);
const Component = module.exports.default;
for (const language of ["en", "fr"]) {
  for (const target of ["starter", "pro"]) {
    for (const action of ["checkout", "upgrade"]) {
      for (const canManage of [false, true]) {
        for (const trusted of [false, true]) {
          const html = renderToStaticMarkup(React.createElement(Component, {
            language, billingNotice: null, onRefresh: async () => {},
            capabilities: {
              plan: { code: canManage ? "starter" : "community" },
              subscription: { status: canManage ? "paid_active" : "free_active", can_manage_billing: canManage },
              upgrade: { available: true, action, target_plans: [target] },
              features: {},
              manifest: trusted ? { authority: "neurocheckout_cloud", deny_by_default: true } : null,
            },
          }));
          const destination = action === "upgrade" || target === "pro" ? "Pro" : "Starter";
          assert(html.includes((language === "fr" ? "Passer à " : "Upgrade to ") + destination));
          const portal = language === "fr" ? "Changer d’offre — Upgrade / Downgrade" : "Change plan — Upgrade / Downgrade";
          assert.equal(html.includes(portal), canManage);
          assert(!html.includes("Continue securely"));
          const buttons = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)];
          for (const [, attributes, label] of buttons) {
            if (label.includes("Refresh") || label.includes("Actualiser") || label.includes("Not now") || label.includes("Plus tard")) continue;
            assert.equal(attributes.includes('disabled=""'), !trusted);
          }
        }
      }
    }
  }
}
console.log("PASS: 32 bilingual plan-label and billing-guard combinations.");
