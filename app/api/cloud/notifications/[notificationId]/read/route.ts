import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  const { notificationId } = await context.params;
  return authenticatedCloudFetch(
    request,
    `/api/v1/member/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  );
}
