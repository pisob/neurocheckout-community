import { NextRequest, NextResponse } from "next/server";

import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  return params.then(({ templateId }) => {
    if (!UUID_PATTERN.test(templateId)) {
      return NextResponse.json({ detail: "template_id_invalid" }, { status: 400 });
    }
    return authenticatedCloudFetch(
      request,
      `/api/v1/member/email-templates/${encodeURIComponent(templateId)}/rollback`,
      { method: "POST" },
    );
  });
}
