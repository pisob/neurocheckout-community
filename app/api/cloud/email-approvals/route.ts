import { NextRequest, NextResponse } from "next/server";
import { EmailArchive } from "@/scripts/email-archive.mjs";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { cloudApiBaseUrl } from "@/lib/config";
import { authorizedWorkspaceDirectory } from "@/lib/workspace";
import { enrichEmailApprovals } from "@/lib/email-approval-archive";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/member/email-approvals");
  for (const key of ["status", "shop_id", "shop_uuid", "limit", "offset"]) {
    const value = String(request.nextUrl.searchParams.get(key) || "").trim();
    if (value) target.searchParams.set(key, value);
  }
  const response = await authenticatedCloudFetch(request, `${target.pathname}${target.search}`);
  response.headers.set("Cache-Control", "no-store, private");
  if (!response.ok) return response;
  const payload = await response.clone().json();
  if (!Array.isArray(payload?.items)) return response;
  const shopUuid = target.searchParams.get("shop_uuid");
  // Missing/mismatched context must never select an arbitrary local vault.
  payload.items = enrichEmailApprovals(payload.items);
  if (shopUuid && payload.items.some((item: Record<string, unknown>) => item.content_location === "community_local" && item.shop_uuid === shopUuid)) {
    let archive: EmailArchive | undefined;
    try {
      const context = await authorizedWorkspaceDirectory(request, shopUuid);
      const cookie = context.response.headers.get("set-cookie");
      if (cookie) response.headers.set("set-cookie", cookie);
      if (context.directory) {
        archive = new EmailArchive(context.directory);
        const installationId = archive.installationId();
        const bound = { shopId: archive.store.config.shopId, installationId: String(installationId || ""), get: (id: string) => archive!.get(id) };
        payload.items = payload.items.map((item: Record<string, unknown>) => item.shop_uuid === shopUuid ? enrichEmailApprovals([item], bound)[0] : item);
      }
    } catch { /* Keep explicit unavailable previews; never fall back across shops. */ }
    finally { archive?.close(); }
  }
  payload.items = payload.items.map((item: Record<string, unknown>) => ({ ...item, preview_asset_base_url: new URL(cloudApiBaseUrl()).origin }));
  const headers = new Headers(response.headers); headers.delete("content-length");
  return NextResponse.json(payload, { headers });
}
