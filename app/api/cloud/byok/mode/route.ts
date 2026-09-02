import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

function target(request: NextRequest): string | null {
  const shopUuid = String(request.nextUrl.searchParams.get("shop_uuid") || "").trim();
  if (!UUID_PATTERN.test(shopUuid)) return null;
  return `/api/v1/member/shops/${encodeURIComponent(shopUuid)}/llm-mode`;
}

export async function PUT(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path, { method: "PUT", body: await request.text() })
    : NextResponse.json({ detail: "byok_mode_request_invalid" }, { status: 400 });
}
