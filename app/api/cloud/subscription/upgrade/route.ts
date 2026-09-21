import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { communityRedirectUri } from "@/lib/config";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const BILLING_CYCLES = new Set(["monthly", "annual"]);

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  const body = await request.json().catch(() => null) as { billing_cycle?: unknown } | null;
  const billingCycle = typeof body?.billing_cycle === "string"
    ? body.billing_cycle.trim().toLowerCase()
    : "monthly";
  if (!BILLING_CYCLES.has(billingCycle)) {
    return NextResponse.json({ detail: "invalid_billing_cycle" }, { status: 400 });
  }
  return authenticatedCloudFetch(request, "/api/v1/billing/upgrade-session", {
    method: "POST",
    body: JSON.stringify({
      billing_cycle: billingCycle,
      community_return_uri: `${new URL(communityRedirectUri()).origin}/`,
    }),
  });
}
