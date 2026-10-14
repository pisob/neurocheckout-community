import { NextRequest } from "next/server";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const response = await authenticatedCloudFetch(request, "/api/v1/member/community-funding", {}, 3000);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
