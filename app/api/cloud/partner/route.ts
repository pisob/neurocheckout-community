import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

const PLATFORM_VALUES = new Set(["prestashop", "woocommerce", "magento", "shopify"]);
const REFERRAL_VALUES = new Set(["registered", "converted", "rejected", "cancelled"]);
const STATE_VALUES = new Set(["active", "inactive"]);

function invalidQuery() {
  return NextResponse.json({ detail: "invalid_partner_query" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/affiliates/me");
  const page = String(request.nextUrl.searchParams.get("referred_sites_page") || "1").trim();
  const perPage = String(request.nextUrl.searchParams.get("referred_sites_per_page") || "10").trim();
  const query = String(request.nextUrl.searchParams.get("referred_sites_q") || "").trim();
  const platform = String(request.nextUrl.searchParams.get("referred_sites_platform") || "").trim().toLowerCase();
  const referral = String(request.nextUrl.searchParams.get("referred_sites_referral_status") || "").trim().toLowerCase();
  const state = String(request.nextUrl.searchParams.get("referred_sites_state") || "").trim().toLowerCase();
  if (
    !/^\d+$/.test(page)
    || Number(page) < 1
    || Number(page) > 1_000_000
    || !/^\d+$/.test(perPage)
    || Number(perPage) < 5
    || Number(perPage) > 50
    || query.length > 120
    || (platform && !PLATFORM_VALUES.has(platform))
    || (referral && !REFERRAL_VALUES.has(referral))
    || (state && !STATE_VALUES.has(state))
  ) {
    return invalidQuery();
  }
  target.searchParams.set("referred_sites_page", page);
  target.searchParams.set("referred_sites_per_page", perPage);
  if (query) target.searchParams.set("referred_sites_q", query);
  if (platform) target.searchParams.set("referred_sites_platform", platform);
  if (referral) target.searchParams.set("referred_sites_referral_status", referral);
  if (state) target.searchParams.set("referred_sites_state", state);
  return authenticatedCloudFetch(request, `${target.pathname}${target.search}`);
}
