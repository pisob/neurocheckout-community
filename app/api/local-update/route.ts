import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { rejectForeignMutation } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const TERMINAL_PHASES = new Set(["complete", "failed", "rolled_back", "interrupted"]);

function validVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

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
  let state: { phase: string; version?: string } = { phase: "idle" };
  if (directory) {
    try { state = JSON.parse(await readFile(join(directory, "status.json"), "utf8")); } catch { /* No update yet. */ }
    if (TERMINAL_PHASES.has(state.phase) && !validVersion(state.version)) {
      try {
        const target = JSON.parse(await readFile(join(directory, "target.json"), "utf8"));
        if (validVersion(target?.version)) state = { ...state, version: target.version };
      } catch { /* Older launchers do not persist a target marker. */ }
    }
    if (state.phase === "complete" && !validVersion(state.version) && validVersion(result.dashboard.current_version)) {
      // Compatibility with installations whose stable launcher predates
      // versioned status files. The running server is authoritative here.
      state = { ...state, version: result.dashboard.current_version };
    }
    try {
      const queued = JSON.parse(await readFile(join(directory, "request.json"), "utf8"));
      if (!["verifying", "downloading", "building", "restarting"].includes(state.phase)) {
        state = validVersion(queued?.version) ? { phase: "queued", version: queued.version } : { phase: "queued" };
      }
    } catch { /* No pending request. */ }
    const latestVersion = result.dashboard.latest_version;
    // A terminal state describes one release attempt. Do not present an old
    // success or failure as the outcome of a newly advertised release.
    if (TERMINAL_PHASES.has(state.phase) && (!validVersion(state.version) || state.version !== latestVersion)) {
      state = { phase: "idle" };
    }
    if (state.phase === "complete" && state.version !== result.dashboard.current_version) {
      // A marker alone cannot prove activation: the running build must also
      // identify itself as the release that completed.
      state = { phase: "idle" };
    }
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
  if (!validVersion(version) ||
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
    await writeFile(join(directory, "target.tmp"), JSON.stringify({ version }), { mode: 0o600 });
    await rename(join(directory, "target.tmp"), join(directory, "target.json"));
    await writeFile(join(directory, "request.tmp"), JSON.stringify({ version }), { mode: 0o600 });
    await rename(join(directory, "request.tmp"), join(directory, "request.json"));
  } catch {
    await rm(join(directory, "target.json"), { force: true });
    await rm(join(directory, "target.tmp"), { force: true });
    await rm(join(directory, "request.tmp"), { force: true });
    await rm(join(directory, "queue.lock"), { recursive: true, force: true });
    return NextResponse.json({ detail: "update_queue_unavailable" }, { status: 503 });
  }
  const response = NextResponse.json({ phase: "queued" }, { status: 202 });
  for (const cookie of result.response.cookies.getAll()) response.cookies.set(cookie);
  for (const cookie of targetResponse.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
