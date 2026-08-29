import { NextRequest, NextResponse } from "next/server";

import { cloudApiBaseUrl } from "@/lib/config";
import { refreshOAuthSession } from "@/lib/cloud-client";
import {
  COMMUNITY_SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  unsealSession,
  type OAuthSession,
} from "@/lib/oauth-session";

export const COMMUNITY_DASHBOARD_VERSION = "0.1.0";

async function resolveSession(request: NextRequest): Promise<{ session: OAuthSession; refreshed: boolean } | null> {
  let session = unsealSession(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value);
  if (!session) return null;
  let refreshed = false;
  if (session.expires_at <= Date.now() + 30_000) {
    session = await refreshOAuthSession(session);
    refreshed = true;
  }
  return { session, refreshed };
}

export async function authenticatedCloudFetch(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  try {
    const resolved = await resolveSession(request);
    if (!resolved) return NextResponse.json({ detail: "community_not_connected" }, { status: 401 });
    let { session, refreshed } = resolved;

    const send = (accessToken: string) => fetch(`${cloudApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-NeuroCheckout-Community-Version": COMMUNITY_DASHBOARD_VERSION,
        ...(init.headers || {}),
      },
      cache: "no-store",
    });

    let cloudResponse = await send(session.access_token);
    if (cloudResponse.status === 401 && !refreshed) {
      session = await refreshOAuthSession(session);
      refreshed = true;
      cloudResponse = await send(session.access_token);
    }
    const payload = await cloudResponse.json().catch(() => ({ detail: "cloud_response_invalid" }));
    const response = NextResponse.json(payload, { status: cloudResponse.status });
    if (refreshed) response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(session), sessionCookieOptions());
    if (cloudResponse.status === 401) response.cookies.delete(COMMUNITY_SESSION_COOKIE);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cloud_unavailable";
    const response = NextResponse.json({ detail }, { status: 401 });
    response.cookies.delete(COMMUNITY_SESSION_COOKIE);
    return response;
  }
}
