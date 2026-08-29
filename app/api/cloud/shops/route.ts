import { NextRequest } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export function GET(request: NextRequest) {
  return authenticatedCloudFetch(request, "/api/v1/member/shops");
}

export async function POST(request: NextRequest) {
  return authenticatedCloudFetch(request, "/api/v1/member/shops/create", {
    method: "POST",
    body: await request.text(),
  });
}
