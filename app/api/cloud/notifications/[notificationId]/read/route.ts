import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  const { notificationId } = await context.params;
  const locale = request.nextUrl.searchParams.get("locale");
  const target = "/api/v1/member/notifications/mark-read" + (locale === "fr" || locale === "en" ? `?locale=${locale}` : "");
  return authenticatedCloudFetch(
    request,
    target,
    {
      method: "POST",
      body: JSON.stringify({ notification_id: notificationId }),
    },
  );
}
