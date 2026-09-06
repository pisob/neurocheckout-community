import {
  cloudApiBaseUrl,
  communityClientId,
  communityRedirectUri,
} from "@/lib/config";
import type { OAuthSession } from "@/lib/oauth-session";
import { cloudFetch, CloudRequestError } from "@/lib/cloud-transport";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  detail?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<OAuthSession> {
  const response = await cloudFetch(`${cloudApiBaseUrl()}/api/v1/public/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }, 15_000);
  if (response.status >= 500 || response.status === 429) {
    await response.body?.cancel();
    throw new CloudRequestError("cloud_unavailable", 503);
  }
  let payload: TokenPayload;
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    payload = parsed as TokenPayload;
  } catch {
    throw new CloudRequestError("cloud_response_invalid", 502);
  }
  if (!response.ok) {
    const invalidRefresh = body.grant_type === "refresh_token" &&
      [400, 401, 403].includes(response.status) &&
      new Set([
        "invalid_grant", "community_refresh_token_invalid",
        "community_refresh_token_expired", "community_installation_revoked",
        "community_active_member_required",
      ]).has(String(payload.detail || ""));
    if (invalidRefresh) throw new CloudRequestError("community_not_connected", 401, true);
    throw new CloudRequestError("cloud_response_invalid", 502);
  }
  const expiresIn = payload.expires_in ?? 900;
  if (
    typeof payload.access_token !== "string" || !payload.access_token.trim() ||
    typeof payload.refresh_token !== "string" || !payload.refresh_token.trim() ||
    typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0 ||
    !Number.isSafeInteger(Date.now() + expiresIn * 1000) ||
    (payload.token_type !== undefined && (typeof payload.token_type !== "string" || payload.token_type.toLowerCase() !== "bearer"))
  ) {
    throw new CloudRequestError("cloud_response_invalid", 502);
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: "Bearer",
    scope: String(payload.scope || ""),
    expires_at: Date.now() + expiresIn * 1000,
  };
}

export function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: communityClientId(),
    code,
    redirect_uri: communityRedirectUri(),
    code_verifier: codeVerifier,
  });
}

export function refreshOAuthSession(session: OAuthSession) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: communityClientId(),
    refresh_token: session.refresh_token,
  });
}

export async function revokeOAuthSession(session: OAuthSession): Promise<void> {
  await cloudFetch(`${cloudApiBaseUrl()}/api/v1/public/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: communityClientId(),
      refresh_token: session.refresh_token,
    }),
    cache: "no-store",
  }, 10_000).catch(() => undefined);
}

export function fetchCloudCapabilities(accessToken: string): Promise<Response> {
  return cloudFetch(`${cloudApiBaseUrl()}/api/v1/member/capabilities`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}
