import { resolve } from "node:path";
import { cloudApiBaseUrl, communityClientId, sessionSecret } from "@/lib/config";
import { heartbeatOnce, saveAvailabilityCredential } from "@/scripts/server-availability.mjs";
import { version } from "@/package.json";

function options() {
  return {
    directory: process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"),
    secret: sessionSecret(), cloudUrl: cloudApiBaseUrl(), clientId: communityClientId(),
    port: process.env.PORT || "3400", version,
  };
}

export async function persistAvailabilityToken(token: string) {
  await saveAvailabilityCredential({ ...options(), token });
}

export function startAvailabilityHeartbeat() {
  const state = globalThis as typeof globalThis & { communityAvailabilityStarted?: boolean };
  if (state.communityAvailabilityStarted) return;
  state.communityAvailabilityStarted = true;
  const tick = async () => {
    try { await heartbeatOnce(options()); } catch { /* Configuration may not be ready yet. */ }
    setTimeout(tick, 30_000).unref();
  };
  setTimeout(tick, 1000).unref();
}
