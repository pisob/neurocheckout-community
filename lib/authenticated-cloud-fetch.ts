import { NextRequest, NextResponse } from "next/server";

import packageMetadata from "@/package.json";
import { cloudApiBaseUrl } from "@/lib/config";
import { refreshOAuthSession } from "@/lib/cloud-client";
import { cloudFetch, CloudRequestError } from "@/lib/cloud-transport";
import { rejectForeignMutation } from "@/lib/request-origin";
import {
  COMMUNITY_SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  unsealSession,
  type OAuthSession,
} from "@/lib/oauth-session";

export const COMMUNITY_DASHBOARD_VERSION = packageMetadata.version;

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
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  let resolved: { session: OAuthSession; refreshed: boolean } | null = null;
  try {
    resolved = await resolveSession(request);
    if (!resolved) return NextResponse.json({ detail: "community_not_connected" }, { status: 401 });
    let { session, refreshed } = resolved;

    const send = (accessToken: string) => cloudFetch(`${cloudApiBaseUrl()}${path}`, {
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
      await cloudResponse.body?.cancel();
      session = await refreshOAuthSession(session);
      refreshed = true;
      resolved = { session, refreshed };
      cloudResponse = await send(session.access_token);
    }
    if (cloudResponse.status === 401) {
      await cloudResponse.body?.cancel();
      throw new CloudRequestError("community_not_connected", 401, true);
    }
    if (cloudResponse.status >= 500) {
      await cloudResponse.body?.cancel();
      throw new CloudRequestError("cloud_unavailable", 503);
    }
    if (cloudResponse.status === 204) {
      const response = new NextResponse(null, { status: 204 });
      if (refreshed) response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(session), sessionCookieOptions());
      return response;
    }

    const contentType = String(cloudResponse.headers.get("content-type") || "").toLowerCase();
    const responseText = await cloudResponse.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }

    if (!contentType.includes("application/json") || payload === null) {
      const response = NextResponse.json(
        { detail: "cloud_response_invalid" },
        { status: 502 },
      );
      if (refreshed) response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(session), sessionCookieOptions());
      return response;
    }

    const response = NextResponse.json(payload, { status: cloudResponse.status });
    if (refreshed) response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(session), sessionCookieOptions());
    return response;
  } catch (error) {
    const failure = error instanceof CloudRequestError
      ? error : new CloudRequestError("cloud_unavailable", 503);
    const response = NextResponse.json({ detail: failure.detail }, { status: failure.status });
    if (failure.invalidateSession) response.cookies.delete(COMMUNITY_SESSION_COOKIE);
    else if (resolved?.refreshed) {
      // Rotation already succeeded: persist the replacement even if the next
      // resource request failed, otherwise the browser would retain a used token.
      response.cookies.set(COMMUNITY_SESSION_COOKIE, sealSession(resolved.session), sessionCookieOptions());
    }
    return response;
  }
}
