import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const PLANS = new Set(["starter", "pro"]);

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  const body = await request.json().catch(() => null) as { plan_code?: unknown } | null;
  const planCode = typeof body?.plan_code === "string" ? body.plan_code.trim().toLowerCase() : "";
  if (!PLANS.has(planCode)) {
    return NextResponse.json({ detail: "invalid_plan_code" }, { status: 400 });
  }
  return authenticatedCloudFetch(request, "/api/v1/member/onboarding/select-plan", {
    method: "POST",
    body: JSON.stringify({ plan_code: planCode, billing_platform: "stripe" }),
  });
}
