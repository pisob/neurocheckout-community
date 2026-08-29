import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

function target(request: NextRequest): string | null {
  const shopUuid = String(request.nextUrl.searchParams.get("shop_uuid") || "").trim();
  const provider = String(request.nextUrl.searchParams.get("provider") || "openai").trim().toLowerCase();
  if (!UUID_PATTERN.test(shopUuid) || !PROVIDER_PATTERN.test(provider)) return null;
  return `/api/v1/member/shops/${encodeURIComponent(shopUuid)}/byok?provider=${encodeURIComponent(provider)}`;
}

export function GET(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path)
    : NextResponse.json({ detail: "byok_request_invalid" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path, { method: "PUT", body: await request.text() })
    : NextResponse.json({ detail: "byok_request_invalid" }, { status: 400 });
}

export function DELETE(request: NextRequest) {
  const path = target(request);
  return path
    ? authenticatedCloudFetch(request, path, { method: "DELETE" })
    : NextResponse.json({ detail: "byok_request_invalid" }, { status: 400 });
}
