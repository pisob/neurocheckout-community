import { resolve } from "node:path";
import { cloudApiBaseUrl, communityClientId, sessionSecret } from "@/lib/config";
import { version } from "@/package.json";

function options() {
  return {
    enabled: process.env.NC_LOCAL_DATA_PILOT_ENABLED === "true",
    environment: process.env.NC_DEPLOYMENT_ENV || "production",
    directory: process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"),
    secret: sessionSecret(), cloudUrl: cloudApiBaseUrl(), clientId: communityClientId(),
    port: process.env.PORT || "3400", version,
  };
}

export async function persistRelayCredential(credential: unknown) {
  if (process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || process.env.NC_DEPLOYMENT_ENV !== "staging") return;
  const { saveRelayCredential } = await import("@/scripts/server-data-relay.mjs");
  await saveRelayCredential(options(), credential);
}

export function startDataRelay() {
  if (process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || process.env.NC_DEPLOYMENT_ENV !== "staging") return;
  const state = globalThis as typeof globalThis & { communityRelayStarted?: boolean };
  if (state.communityRelayStarted) return;
  state.communityRelayStarted = true;
  let failures = 0;
  const tick = async () => {
    let ok = false;
    try {
      const { relayOnce } = await import("@/scripts/server-data-relay.mjs");
      ok = await relayOnce(options());
    } catch { /* Missing configuration or an unavailable server keeps actions paused. */ }
    failures = ok ? 0 : Math.min(failures + 1, 5);
    const delay = ok ? 250 : Math.min(30_000, 1000 * 2 ** failures) + Math.random() * 1000;
    setTimeout(tick, delay).unref();
  };
  setTimeout(tick, 1000).unref();
}
