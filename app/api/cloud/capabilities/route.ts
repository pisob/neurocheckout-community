import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return authenticatedCloudFetch(request, "/api/v1/member/capabilities");
}
