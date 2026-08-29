import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { exchangeAuthorizationCode } from "@/lib/cloud-client";
import {
  COMMUNITY_SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  sealSession,
  sessionCookieOptions,
} from "@/lib/oauth-session";

export const runtime = "nodejs";

function sameValue(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const code = String(request.nextUrl.searchParams.get("code") || "").trim();
  const state = String(request.nextUrl.searchParams.get("state") || "").trim();
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value || "";
  const verifier = request.cookies.get(PKCE_VERIFIER_COOKIE)?.value || "";
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(PKCE_VERIFIER_COOKIE);
    return response;
  };

  if (!code || !state || !expectedState || !verifier || !sameValue(state, expectedState)) {
    return finish("/?auth_error=oauth_state_invalid");
  }

  try {
    const session = await exchangeAuthorizationCode(code, verifier);
    const response = finish("/?connected=1");
    response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(session), sessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_exchange_failed";
    return finish(`/?auth_error=${encodeURIComponent(message)}`);
  }
}
