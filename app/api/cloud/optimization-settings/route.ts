import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ detail: "invalid_request" }, { status: 400 });
  }
  return authenticatedCloudFetch(
    request,
    "/api/v1/member/analytics/optimization-settings",
    { method: "POST", body: JSON.stringify(body) },
  );
}
