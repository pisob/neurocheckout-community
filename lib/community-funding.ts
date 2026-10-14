export type FundingCapabilities = { plan?: { code?: string }; subscription?: { status?: string; active?: boolean } };
type Copy = { title: string; description: string };
export type Funding = {
  schema_version: 1;
  eligible: true;
  expires_at: string;
  sponsor: { id: string; url: string; fr: Copy; en: Copy } | null;
  support: { mode: "live" | "test" } | null;
};

export function fundingEligible(capabilities: FundingCapabilities | null, fresh: boolean): boolean {
  return fresh && capabilities?.plan?.code === "community" && capabilities.subscription?.status === "free_active"
    && capabilities.subscription.active === true;
}

export function publicFundingUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000 || /[\s\\<>\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      && !url.search && !url.hash && url.hostname.includes(".")
      && /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(url.hostname)
      && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      && !/\.(localhost|local|internal|test|invalid)$/.test(url.hostname);
  } catch { return false; }
}

export function supportUrl(value: unknown, mode: "live" | "test"): value is string {
  if (!publicFundingUrl(value)) return false;
  const url = new URL(value);
  return url.host === "buy.stripe.com" && /^\/[A-Za-z0-9_]+$/.test(url.pathname)
    && url.pathname.startsWith("/test_") === (mode === "test");
}

export function parseFunding(value: unknown, now = Date.now()): Funding | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<Funding>;
  const expiry = Date.parse(data.expires_at || "");
  if (data.schema_version !== 1 || data.eligible !== true || !Number.isFinite(expiry)
    || expiry <= now || expiry > now + 125_000) return null;
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[<>\x00-\x1f\x7f]/.test(v);
  const copy = (v: Copy) => v && text(v.title, 90) && text(v.description, 220);
  const s = data.sponsor;
  const sponsor = s && typeof s.id === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s.id)
    && publicFundingUrl(s.url) && copy(s.fr) && copy(s.en) ? s : null;
  const support = data.support && ["live", "test"].includes(data.support.mode) ? data.support : null;
  return { schema_version: 1, eligible: true, expires_at: data.expires_at!, sponsor, support };
}
