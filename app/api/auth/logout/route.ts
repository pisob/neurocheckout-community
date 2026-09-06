import { NextRequest, NextResponse } from "next/server";

import { revokeOAuthSession } from "@/lib/cloud-client";
import { COMMUNITY_SESSION_COOKIE, unsealSession } from "@/lib/oauth-session";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  const session = unsealSession(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value);
  if (session) await revokeOAuthSession(session);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COMMUNITY_SESSION_COOKIE);
  return response;
}
