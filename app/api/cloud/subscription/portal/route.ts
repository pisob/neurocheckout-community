import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { communityRedirectUri } from "@/lib/config";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  return authenticatedCloudFetch(request, "/api/v1/billing/payment-portal-session", {
    method: "POST",
    body: JSON.stringify({
      source: "community",
      community_return_uri: `${new URL(communityRedirectUri()).origin}/`,
    }),
  });
}
