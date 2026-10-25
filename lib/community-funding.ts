export type FundingCapabilities = { plan?: { code?: string }; subscription?: { status?: string; active?: boolean } };
type Copy = { title: string; description: string };
export type SponsorImage = { asset_id: string; width: number; height: number; animated: boolean; alt_fr: string; alt_en: string };
export type Sponsor = { id: string; url: string; fr: Copy; en: Copy; image?: SponsorImage | null };
export type Funding = {
  schema_version: 1;
  eligible: true;
  expires_at: string;
  sponsor: Sponsor | null;
  sponsors?: Sponsor[];
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
  const sponsor = parseSponsor(data.sponsor);
  // An explicit list is authoritative, including an empty one. Older Clouds
  // still supply one sponsor. Malformed/oversized lists fail closed.
  const candidates = data.sponsors === undefined ? (sponsor ? [sponsor] : [])
    : Array.isArray(data.sponsors) && data.sponsors.length <= 20 ? data.sponsors : [];
  const sponsors = [...new Map(candidates.map(parseSponsor).filter((s): s is Sponsor => !!s).map(s => [s.id, s])).values()];
  const support = data.support && ["live", "test"].includes(data.support.mode) ? data.support : null;
  return { schema_version: 1, eligible: true, expires_at: data.expires_at!, sponsor, sponsors, support };
}

function parseSponsor(value: unknown): Sponsor | null {
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[<>\x00-\x1f\x7f]/.test(v);
  const copy = (v: Copy) => v && text(v.title, 90) && text(v.description, 220);
  const s = value as Sponsor;
  let sponsor = s && typeof s.id === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s.id)
    && publicFundingUrl(s.url) && copy(s.fr) && copy(s.en) ? s : null;
  if (sponsor) {
    const i = sponsor.image;
    const valid = i && typeof i.asset_id === "string" && /^[a-f0-9]{64}$/.test(i.asset_id)
      && Number.isInteger(i.width) && i.width >= 1 && i.width <= 2048
      && Number.isInteger(i.height) && i.height >= 1 && i.height <= 2048
      && typeof i.animated === "boolean" && text(i.alt_fr, 180) && text(i.alt_en, 180);
    // A bad/missing optional image must not hide valid text or the support button.
    sponsor = { ...sponsor, image: valid ? {
      asset_id: i.asset_id, width: i.width, height: i.height, animated: i.animated, alt_fr: i.alt_fr, alt_en: i.alt_en,
    } : null };
  }
  return sponsor;
}

/** No account identifier or history: only avoid the immediately previous item. */
export function nextSponsor(sponsors: Sponsor[], previous: string | null, random = Math.random): Sponsor | null {
  const alternatives = sponsors.filter(s => s.id !== previous);
  const choices = alternatives.length ? alternatives : sponsors;
  return choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : null;
}
