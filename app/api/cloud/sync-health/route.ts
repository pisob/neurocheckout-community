import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/member/analytics/sync-health");
  const shopUuid = String(request.nextUrl.searchParams.get("shop_uuid") || "").trim();
  if (shopUuid) target.searchParams.set("shop_uuid", shopUuid);
  const response = await authenticatedCloudFetch(request, `${target.pathname}${target.search}`);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
