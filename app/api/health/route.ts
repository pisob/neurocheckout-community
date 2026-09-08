import { NextResponse } from "next/server";
import metadata from "@/package.json";

export function GET() {
  return NextResponse.json({ ok: true, service: "neurocheckout-community", version: metadata.version });
}
