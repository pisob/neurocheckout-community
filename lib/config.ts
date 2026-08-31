function placeholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return ["replace_with", "replace-with", "replace_me", "replace-me", "change_me", "change-me"].some(
    (marker) => normalized.includes(marker),
  );
}

function required(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value || placeholder(value)) {
    throw new Error(`${name}_not_configured`);
  }
  return value.replace(/\/$/, "");
}

export function communityClientId(): string {
  return required("NC_COMMUNITY_CLIENT_ID");
}

export function communityRedirectUri(): string {
  return required("NC_COMMUNITY_REDIRECT_URI");
}

export function cloudApiBaseUrl(): string {
  return required("NC_CLOUD_API_BASE_URL");
}

export function cloudAuthorizationUrl(): string {
  return required("NC_CLOUD_AUTHORIZATION_URL");
}

export function cloudUpgradeUrl(): string {
  return String(process.env.NC_CLOUD_UPGRADE_URL || "https://neurocheckout.com/pricing").trim();
}

export function sessionSecret(): string {
  const value = String(process.env.NC_COMMUNITY_SESSION_SECRET || "").trim();
  if (process.env.NODE_ENV === "production" && (value.length < 32 || placeholder(value))) {
    throw new Error("NC_COMMUNITY_SESSION_SECRET_must_have_32_characters");
  }
  return value || "development-only-community-session-secret";
}

export function useSecureCookies(): boolean {
  const override = String(process.env.NC_COMMUNITY_COOKIE_SECURE || "").trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}
