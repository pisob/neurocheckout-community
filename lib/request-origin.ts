import { NextRequest, NextResponse } from "next/server";

import { communityRedirectUri } from "@/lib/config";

// Cookie authentication needs an origin check even between same-site origins
// (for example, two local applications on different ports).
export function rejectForeignMutation(request: NextRequest): NextResponse | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  let expectedOrigin: string;
  try {
    const configured = new URL(communityRedirectUri());
    if (!["http:", "https:"].includes(configured.protocol)) throw new Error();
    expectedOrigin = configured.origin;
  } catch {
    return NextResponse.json({ detail: "community_not_configured" }, { status: 503 });
  }
  if (
    request.headers.get("origin") !== expectedOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return NextResponse.json({ detail: "community_origin_rejected" }, { status: 403 });
  }
  return null;
}
