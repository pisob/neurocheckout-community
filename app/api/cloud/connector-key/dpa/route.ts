import { NextRequest } from "next/server";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

export function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "fr" ? "fr" : "en";
  return authenticatedCloudFetch(request, `/api/v1/member/api-keys/dpa?locale=${locale}`);
}
