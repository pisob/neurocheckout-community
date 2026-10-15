import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  const { approvalId } = await context.params;
  const query = new URLSearchParams();
  const shop = request.nextUrl.searchParams.get("shop_uuid");
  if (shop) query.set("shop_uuid", shop);
  return authenticatedCloudFetch(
    request,
    `/api/v1/member/email-approvals/${encodeURIComponent(approvalId)}/reject?${query}`,
    { method: "POST" },
  );
}
