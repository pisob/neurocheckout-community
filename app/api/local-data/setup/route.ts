import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Binding = {
  schema?: unknown;
  shop_id?: unknown;
  platform?: unknown;
  endpoint?: unknown;
  secret?: unknown;
};

function stateDirectory(): string {
  return process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
}

export async function GET() {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true") {
    return NextResponse.json({ available: false, configured: false, ready: false });
  }
  const { automaticSourceStatus } = await import("@/scripts/automatic-source-setup.mjs");
  return NextResponse.json({ available: true, ...automaticSourceStatus(stateDirectory()) });
}

export async function POST(request: NextRequest) {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true") {
    return NextResponse.json({ detail: "local_data_unavailable" }, { status: 404 });
  }
  let shopUuid = "";
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) throw new Error();
    const body = JSON.parse(raw) as { shop_uuid?: unknown };
    shopUuid = typeof body.shop_uuid === "string" ? body.shop_uuid.trim() : "";
    if (!/^[a-f0-9-]{36}$/i.test(shopUuid)) throw new Error();
  } catch {
    return NextResponse.json({ detail: "local_data_request_invalid" }, { status: 400 });
  }

  const cloud = await authenticatedCloudFetch(
    request,
    `/api/v1/member/shops/${encodeURIComponent(shopUuid)}/community-source-binding`,
    { method: "GET" },
  );
  if (!cloud.ok) return cloud;

  try {
    const binding = await cloud.json() as Binding;
    const { configureAutomaticSource } = await import("@/scripts/automatic-source-setup.mjs");
    configureAutomaticSource(stateDirectory(), binding as Parameters<typeof configureAutomaticSource>[1]);
    const response = NextResponse.json({ status: "synchronizing", shop_id: binding.shop_id });
    const rotatedCookie = cloud.headers.get("set-cookie");
    if (rotatedCookie) response.headers.set("set-cookie", rotatedCookie);
    return response;
  } catch {
    return NextResponse.json({ detail: "local_data_setup_failed" }, { status: 503 });
  }
}
