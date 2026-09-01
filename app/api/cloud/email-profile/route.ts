import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function target(request: NextRequest): string | null {
  const shopUuid = String(request.nextUrl.searchParams.get("shop_uuid") || "").trim();
  const locale = String(request.nextUrl.searchParams.get("locale") || "en").trim();
  if (!UUID_PATTERN.test(shopUuid) || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) return null;
  return `/api/v1/member/shops/${encodeURIComponent(shopUuid)}/email-generation-profile?locale=${encodeURIComponent(locale)}`;
}

export function GET(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path)
    : NextResponse.json({ detail: "email_profile_request_invalid" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path, { method: "PUT", body: await request.text() })
    : NextResponse.json({ detail: "email_profile_request_invalid" }, { status: 400 });
}
