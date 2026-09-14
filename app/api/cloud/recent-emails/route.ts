import { NextRequest, NextResponse } from "next/server";
import { resolve } from "node:path";
import { EmailArchive } from "@/scripts/email-archive.mjs";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const target = new URL("https://community.invalid/api/v1/member/analytics/recent-emails");
  for (const key of ["shop_uuid", "limit"]) {
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
    archive = new EmailArchive(process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"));
    if (archive.store.config.shopId !== payload.shop.shop_id) return response;
    // Only confirmed Cloud sent records can reveal local copies, never preparations.
    payload.items = payload.items.slice(0, 10).map((item: Record<string, unknown>) => {
      const id = String(item.delivery_id || "");
      const copy = archive!.get(id);
      if (!copy || !item.sent_at) return { ...item, preview_available: false };
      archive!.confirm(id, String(item.sent_at));
      return { ...item, subject: copy.subject, recipient_email: copy.recipient_email,
        body_html: copy.body_html, body_text: copy.body_text, preview_available: true,
        preview_source: "encrypted_local_archive" };
    });
    archive.clean();
  } catch {
    // Missing keys/copies do not invent previews or expose private diagnostics.
    payload.items = payload.items.map((item: Record<string, unknown>) => ({ ...item, preview_available: false }));
  } finally { archive?.close(); }
  const headers = new Headers(response.headers); headers.delete("content-length");
  return NextResponse.json(payload, { headers });
}
