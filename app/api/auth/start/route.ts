import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  cloudAuthorizationUrl,
  communityClientId,
  communityRedirectUri,
} from "@/lib/config";
import {
  OAUTH_STATE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  transientCookieOptions,
} from "@/lib/oauth-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
    const authorizationUrl = new URL(cloudAuthorizationUrl());
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", communityClientId());
    authorizationUrl.searchParams.set("redirect_uri", communityRedirectUri());
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    const scopes = [
      "openid", "profile", "capabilities:read", "account:read",
      "shops:read", "shops:write", "templates:read", "templates:write",
      "byok:read", "byok:write", "connectors:write", "emails:read",
      "emails:write", "analytics:read",
    ];
    // The write scope stays on staging until the matching private Cloud route
    // is promoted. This keeps current production installations compatible.
    if (authorizationUrl.hostname === "staging.neurocheckout.com") scopes.push("analytics:write");
    authorizationUrl.searchParams.set(
      "scope",
      scopes.join(" "),
    );
    authorizationUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(OAUTH_STATE_COOKIE, state, transientCookieOptions());
    response.cookies.set(PKCE_VERIFIER_COOKIE, verifier, transientCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "community_not_configured";
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(message)}`, request.nextUrl.origin),
    );
  }
}
