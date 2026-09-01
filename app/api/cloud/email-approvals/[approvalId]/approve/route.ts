import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  const { approvalId } = await context.params;
  return authenticatedCloudFetch(
    request,
    `/api/v1/member/email-approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: "POST" },
  );
}
