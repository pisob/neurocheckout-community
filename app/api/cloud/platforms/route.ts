import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export function GET(request: NextRequest) {
  return authenticatedCloudFetch(request, "/api/v1/member/shops/platforms");
}
