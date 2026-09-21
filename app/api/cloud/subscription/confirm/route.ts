import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  const body = await request.json().catch(() => null) as { session_id?: unknown } | null;
  const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
  if (!/^cs_[A-Za-z0-9_]{8,240}$/.test(sessionId)) {
    return NextResponse.json({ detail: "invalid_checkout_session_id" }, { status: 400 });
  }
  return authenticatedCloudFetch(request, "/api/v1/billing/checkout-session/confirm", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}
