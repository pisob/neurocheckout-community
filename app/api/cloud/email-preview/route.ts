import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const shopUuid = String(request.nextUrl.searchParams.get("shop_uuid") || "").trim();
  if (!UUID_PATTERN.test(shopUuid)) {
    return NextResponse.json({ detail: "email_preview_request_invalid" }, { status: 400 });
  }
  return authenticatedCloudFetch(
    request,
    `/api/v1/member/shops/${encodeURIComponent(shopUuid)}/email-generation-preview`,
    { method: "POST", body: await request.text() },
  );
}
