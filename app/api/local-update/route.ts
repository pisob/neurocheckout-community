import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, access, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context(request: NextRequest) {
  const response = await authenticatedCloudFetch(request, "/api/v1/member/capabilities");
  if (!response.ok) return { response };
  const payload = await response.clone().json();
  return { response, dashboard: payload.dashboard };
}

export async function GET(request: NextRequest) {
  const result = await context(request);
  if (!result.dashboard) return result.response;
  const directory = process.env.NC_LOCAL_UPDATE_DIRECTORY;
  let state = { phase: "idle" };
  if (directory) {
    try { state = JSON.parse(await readFile(join(directory, "status.json"), "utf8")); } catch { /* No update yet. */ }
    try {
      await access(join(directory, "request.json"));
      if (!["verifying", "building", "restarting"].includes(state.phase)) state = { phase: "queued" };
    } catch { /* No pending request. */ }
  }
  const response = NextResponse.json({ available: Boolean(directory), ...state });
  for (const cookie of result.response.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export async function POST(request: NextRequest) {
  const rejected = rejectForeignMutation(request);
  if (rejected) return rejected;
  const result = await context(request);
  if (!result.dashboard) return result.response;
  const directory = process.env.NC_LOCAL_UPDATE_DIRECTORY;
  if (!directory) return NextResponse.json({ detail: "manual_update_required" }, { status: 409 });
  const { latest_version: version, allowed_versions: allowed, update_required, update_recommended } = result.dashboard;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version || "") ||
      !Array.isArray(allowed) || !allowed.includes(version) || !(update_required || update_recommended)) {
    return NextResponse.json({ detail: "no_authorized_update" }, { status: 409 });
  }
  // Reuse a session refreshed by the first call, including rotating tokens.
  for (const cookie of result.response.cookies.getAll()) request.cookies.set(cookie.name, cookie.value);
  const targetResponse = await authenticatedCloudFetch(request, "/api/v1/member/capabilities", {
    headers: { "X-NeuroCheckout-Community-Version": version },
  });
  if (!targetResponse.ok) return targetResponse;
  const target = (await targetResponse.json()).dashboard;
  if (target?.version_status !== "compatible" || target?.update_required !== false) {
    return NextResponse.json({ detail: "target_version_blocked" }, { status: 409 });
  }
  try { await mkdir(join(directory, "queue.lock"), { mode: 0o700 }); } catch {
    return NextResponse.json({ detail: "update_busy" }, { status: 409 });
  }
  try {
    // Atomic publication prevents the launcher from reading a partial request.
    // The browser never supplies a URL, command or target version.
    await writeFile(join(directory, "request.tmp"), JSON.stringify({ version }), { mode: 0o600 });
    await rename(join(directory, "request.tmp"), join(directory, "request.json"));
  } catch {
    await rm(join(directory, "queue.lock"), { recursive: true, force: true });
    return NextResponse.json({ detail: "update_queue_unavailable" }, { status: 503 });
  }
  const response = NextResponse.json({ phase: "queued" }, { status: 202 });
  for (const cookie of result.response.cookies.getAll()) response.cookies.set(cookie);
  for (const cookie of targetResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
