import {
  cloudApiBaseUrl,
  communityClientId,
  communityRedirectUri,
} from "@/lib/config";
import type { OAuthSession } from "@/lib/oauth-session";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  detail?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<OAuthSession> {
  const response = await fetch(`${cloudApiBaseUrl()}/api/v1/public/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as TokenPayload;
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(payload.detail || "community_oauth_token_exchange_failed");
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: "Bearer",
    scope: String(payload.scope || ""),
    expires_at: Date.now() + Math.max(60, Number(payload.expires_in || 900)) * 1000,
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
  await fetch(`${cloudApiBaseUrl()}/api/v1/public/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: communityClientId(),
      refresh_token: session.refresh_token,
    }),
    cache: "no-store",
  }).catch(() => undefined);
}

export function fetchCloudCapabilities(accessToken: string): Promise<Response> {
  return fetch(`${cloudApiBaseUrl()}/api/v1/member/capabilities`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}
