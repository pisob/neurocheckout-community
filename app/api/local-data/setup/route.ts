import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { authorizedWorkspaceDirectory, bootstrapWorkspaceDirectory } from "@/lib/workspace";
import { workspaceEnabled } from "@/lib/config";

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

export async function GET(request: NextRequest) {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true") {
    return NextResponse.json({ available: false, configured: false, ready: false });
  }
  const { automaticSourceStatus } = await import("@/scripts/automatic-source-setup.mjs");
  if (workspaceEnabled()) {
    const shopUuid = request.nextUrl.searchParams.get("shop_uuid");
    if (!shopUuid) return NextResponse.json({ available: true, configured: false, ready: false });
    try {
      const context = await authorizedWorkspaceDirectory(request, shopUuid);
      if (!context.directory) return context.response;
      const response = NextResponse.json({ available: true, ...automaticSourceStatus(context.directory) });
      const cookie = context.response.headers.get("set-cookie");
      if (cookie) response.headers.set("set-cookie", cookie);
      return response;
    } catch { return NextResponse.json({ available: true, configured: false, ready: false }); }
  }
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
    let directory = stateDirectory();
    let cookie = cloud.headers.get("set-cookie");
    if (workspaceEnabled()) {
      const context = await bootstrapWorkspaceDirectory(request, shopUuid);
      if (!context.directory) return context.response;
      directory = context.directory;
      cookie = context.response.headers.get("set-cookie") || cookie;
    }
    const { configureAutomaticSource } = await import("@/scripts/automatic-source-setup.mjs");
    configureAutomaticSource(directory, binding as Parameters<typeof configureAutomaticSource>[1]);
    const response = NextResponse.json({ status: "synchronizing", shop_id: binding.shop_id });
    if (cookie) response.headers.set("set-cookie", cookie);
    return response;
  } catch {
    const response = NextResponse.json({ detail: "local_data_setup_failed" }, { status: 503 });
    const cookie = cloud.headers.get("set-cookie");
    if (cookie) response.headers.set("set-cookie", cookie);
    return response;
  }
}
