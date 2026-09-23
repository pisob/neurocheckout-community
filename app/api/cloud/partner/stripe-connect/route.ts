import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return authenticatedCloudFetch(
    request,
    "/api/v1/affiliates/me/stripe-connect/onboarding-link",
    {
      method: "POST",
      body: JSON.stringify({ community_return_uri: request.nextUrl.origin }),
    },
  );
}
