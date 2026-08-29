import { NextResponse } from "next/server";

import { cloudUpgradeUrl } from "@/lib/config";

export function GET() {
  return NextResponse.redirect(cloudUpgradeUrl());
}
