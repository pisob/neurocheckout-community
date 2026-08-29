import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { sessionSecret, useSecureCookies } from "@/lib/config";

export const COMMUNITY_SESSION_COOKIE = "nc_community_session";
export const OAUTH_STATE_COOKIE = "nc_community_oauth_state";
export const PKCE_VERIFIER_COOKIE = "nc_community_pkce_verifier";

export type OAuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  scope: string;
  expires_at: number;
};

const b64url = (value: Buffer) => value.toString("base64url");
const fromB64url = (value: string) => Buffer.from(value, "base64url");

function encryptionKey(): Buffer {
  return createHash("sha256").update(sessionSecret(), "utf8").digest();
}

export function sealSession(payload: OAuthSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return ["v1", b64url(iv), b64url(cipher.getAuthTag()), b64url(encrypted)].join(".");
}

export function unsealSession(value: string | undefined): OAuthSession | null {
  const [version, ivValue, tagValue, encryptedValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), fromB64url(ivValue));
    decipher.setAuthTag(fromB64url(tagValue));
    const decrypted = Buffer.concat([
      decipher.update(fromB64url(encryptedValue)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(decrypted) as OAuthSession;
    if (!payload.access_token || !payload.refresh_token || !payload.expires_at) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function transientCookieOptions() {
  return {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };
}
