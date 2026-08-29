import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    shop_uuid?: string;
    operation?: "create" | "rotate";
    dpa_accepted?: boolean;
  };
  const shopUuid = String(payload.shop_uuid || "").trim();
  if (!UUID_PATTERN.test(shopUuid)) {
    return NextResponse.json({ detail: "shop_uuid_invalid" }, { status: 400 });
  }
  if (payload.dpa_accepted !== true) {
    return NextResponse.json({ detail: "dpa_acceptance_required" }, { status: 422 });
  }
  const operation = payload.operation === "rotate" ? "rotate" : "create";
  return authenticatedCloudFetch(request, `/api/v1/member/api-keys/${operation}`, {
    method: "POST",
    body: JSON.stringify({
      shop_uuid: shopUuid,
      dpa_accepted: true,
      dpa_version: "1.0",
      dpa_acceptance_text: "I accept the NeuroCheckout Data Processing Addendum (DPA), version 1.0, and confirm that I am authorised to accept it on behalf of my organisation.",
    }),
  });
}
