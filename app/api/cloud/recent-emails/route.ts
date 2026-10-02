import { NextRequest, NextResponse } from "next/server";
import { resolve } from "node:path";
import { EmailArchive } from "@/scripts/email-archive.mjs";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { cloudApiBaseUrl, workspaceEnabled } from "@/lib/config";
import { enrichEmailHistory } from "@/lib/email-history-archive";
import { authorizedWorkspaceDirectory } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/member/analytics/recent-emails");
  for (const key of ["shop_uuid", "limit", "offset", "status"]) {
    const value = String(request.nextUrl.searchParams.get(key) || "").trim();
    if (value) target.searchParams.set(key, value);
  }
  const response = await authenticatedCloudFetch(request, `${target.pathname}${target.search}`);
  response.headers.set("Cache-Control", "no-store, private");
  if (!response.ok) return response;
  const payload = await response.clone().json();
  if (!payload?.shop || payload.shop.shop_uuid !== target.searchParams.get("shop_uuid") || !Array.isArray(payload.items)) return response;
  let archive: EmailArchive | undefined;
  try {
    let directory = process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
    if (workspaceEnabled()) {
      const context = await authorizedWorkspaceDirectory(request, String(payload.shop.shop_uuid));
      if (!context.directory) throw new Error("workspace_archive_unavailable");
      directory = context.directory;
      const cookie = context.response.headers.get("set-cookie");
      if (cookie) response.headers.set("set-cookie", cookie);
    }
    archive = new EmailArchive(directory);
    payload.items = enrichEmailHistory(payload.items, archive.store.config.shopId === payload.shop.shop_id ? archive : undefined);
    archive.clean();
  } catch {
    // Missing keys/copies do not invent previews or expose private diagnostics.
    payload.items = enrichEmailHistory(payload.items);
  } finally { archive?.close(); }
  payload.items = payload.items.map((item: Record<string, unknown>) => ({
    ...item, preview_asset_base_url: new URL(cloudApiBaseUrl()).origin,
  }));
  const headers = new Headers(response.headers); headers.delete("content-length");
  return NextResponse.json(payload, { headers });
}
