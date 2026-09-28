import { NextRequest, NextResponse } from "next/server";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan_code") || "";
  const cycle = request.nextUrl.searchParams.get("billing_cycle") || "";
  if (!["starter", "pro"].includes(plan) || !["monthly", "annual"].includes(cycle)) {
    return NextResponse.json({ detail: "invalid_plan_selection" }, { status: 400 });
  }
  const response = await authenticatedCloudFetch(request, `/api/v1/billing/plan-preview?${new URLSearchParams({ plan_code: plan, billing_cycle: cycle })}`);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
