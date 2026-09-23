import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

const AUDIENCE_TYPES = new Set(["agency", "freelance", "influencer", "merchant", "other"]);

function readString(
  payload: Record<string, unknown>,
  key: string,
  maximum: number,
  minimum = 0,
) {
  const value = payload[key];
  if (value === undefined || value === null || value === "") return minimum === 0 ? null : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) return undefined;
  return normalized;
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    return NextResponse.json({ detail: "invalid_partner_application" }, { status: 400 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 4096) {
    return NextResponse.json({ detail: "invalid_partner_application" }, { status: 400 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ detail: "invalid_partner_application" }, { status: 400 });
  }
  const source = payload as Record<string, unknown>;
  const fullName = readString(source, "full_name", 160, 2);
  const companyName = readString(source, "company_name", 160);
  const websiteUrl = readString(source, "website_url", 320);
  const audienceType = readString(source, "audience_type", 60) || "other";
  const promotionPlan = readString(source, "promotion_plan", 1600, 12);
  const countryCode = readString(source, "country_code", 2);
  const requestedCode = readString(source, "requested_code", 40);
  if (
    fullName === undefined
    || companyName === undefined
    || websiteUrl === undefined
    || promotionPlan === undefined
    || countryCode === undefined
    || requestedCode === undefined
    || !AUDIENCE_TYPES.has(audienceType)
    || (countryCode !== null && !/^[A-Za-z]{2}$/.test(countryCode))
  ) {
    return NextResponse.json({ detail: "invalid_partner_application" }, { status: 400 });
  }
  if (websiteUrl !== null) {
    try {
      const parsedWebsite = new URL(websiteUrl);
      if (parsedWebsite.protocol !== "https:" && parsedWebsite.protocol !== "http:") throw new Error();
    } catch {
      return NextResponse.json({ detail: "invalid_partner_application" }, { status: 400 });
    }
  }
  const forwardedPayload = {
    full_name: fullName,
    company_name: companyName,
    website_url: websiteUrl,
    audience_type: audienceType,
    promotion_plan: promotionPlan,
    country_code: countryCode?.toUpperCase() || null,
    requested_code: requestedCode,
  };
  return authenticatedCloudFetch(request, "/api/v1/affiliates/me/apply", {
    method: "POST",
    body: JSON.stringify(forwardedPayload),
  });
}
