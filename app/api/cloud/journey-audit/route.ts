import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/member/analytics/journey-audit");
  for (const key of ["shop_uuid", "days", "limit", "session_page", "session_filter"]) {
    const value = String(request.nextUrl.searchParams.get(key) || "").trim();
    if (value) target.searchParams.set(key, value);
  }
  return authenticatedCloudFetch(request, `${target.pathname}${target.search}`);
}
