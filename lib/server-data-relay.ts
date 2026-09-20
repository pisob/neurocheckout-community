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

type RelayRuntime = {
  started: boolean;
  running: boolean;
  requested: boolean;
  timer?: ReturnType<typeof setTimeout>;
  tick?: () => Promise<void>;
};

function relayRuntime(): RelayRuntime {
  const state = globalThis as typeof globalThis & { communityRelayRuntime?: RelayRuntime };
  state.communityRelayRuntime ||= { started: false, running: false, requested: false };
  return state.communityRelayRuntime;
}

export function requestDataRelayRun(): boolean {
  const runtime = relayRuntime();
  if (!runtime.started || !runtime.tick) return false;
  runtime.requested = true;
  if (!runtime.running) {
    if (runtime.timer) clearTimeout(runtime.timer);
    runtime.timer = setTimeout(() => void runtime.tick?.(), 0);
    runtime.timer.unref();
  }
  return true;
}

export function startDataRelay() {
  if (process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || process.env.NC_DEPLOYMENT_ENV !== "staging") return;
  const runtime = relayRuntime();
  if (runtime.started) return;
  runtime.started = true;
  let failures = 0;
  const tick = async () => {
    if (runtime.running) { runtime.requested = true; return; }
    runtime.running = true;
    runtime.requested = false;
    let ok = false;
    try {
      const { relayOnce } = await import("@/scripts/server-data-relay.mjs");
      ok = await relayOnce(options());
    } catch { /* Missing configuration or an unavailable server keeps actions paused. */ }
    runtime.running = false;
    failures = ok ? 0 : Math.min(failures + 1, 5);
    const delay = runtime.requested ? 0 : ok ? 250 : Math.min(30_000, 1000 * 2 ** failures) + Math.random() * 1000;
    runtime.timer = setTimeout(() => void tick(), delay);
    runtime.timer.unref();
  };
  runtime.tick = tick;
  runtime.timer = setTimeout(() => void tick(), 1000);
  runtime.timer.unref();
}
