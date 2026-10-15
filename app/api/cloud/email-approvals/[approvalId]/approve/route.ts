import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { readApprovalRequest } from "@/lib/approval-request";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  const { approvalId } = await context.params;
  // The signature binds the approval to the exact original displayed locally.
  let body: { copy_signature?: string } = {};
  try { body = await readApprovalRequest(request); }
  catch { return NextResponse.json({ detail: "email_approval_invalid" }, { status: 422 }); }
  const query = new URLSearchParams();
  const shop = request.nextUrl.searchParams.get("shop_uuid");
  if (shop) query.set("shop_uuid", shop);
  return authenticatedCloudFetch(
    request,
    `/api/v1/member/email-approvals/${encodeURIComponent(approvalId)}/approve?${query}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
