import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    shop_uuid?: string;
    operation?: "create" | "rotate";
    dpa_accepted?: boolean;
    dpa_version?: string;
    dpa_acceptance_text?: string;
    dpa_document_sha256?: string;
    dpa_locale?: string;
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
      dpa_version: payload.dpa_version,
      dpa_acceptance_text: payload.dpa_acceptance_text,
      dpa_document_sha256: payload.dpa_document_sha256,
      dpa_locale: payload.dpa_locale,
    }),
  });
}
