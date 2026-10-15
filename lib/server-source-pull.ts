import { resolve } from "node:path";
import { sourceRetryDelay } from "@/scripts/source-pull-client.mjs";

type SourceRuntime = {
  started: boolean;
  running: boolean;
  requested: boolean;
  timer?: ReturnType<typeof setTimeout>;
  tick?: () => Promise<void>;
};

function sourceRuntime(): SourceRuntime {
  const state = globalThis as typeof globalThis & { communitySourceRuntime?: SourceRuntime };
  state.communitySourceRuntime ||= { started: false, running: false, requested: false };
  return state.communitySourceRuntime;
}

export function requestSourcePullRun(): boolean {
  const runtime = sourceRuntime();
  if (!runtime.started || !runtime.tick) return false;
  runtime.requested = true;
  if (!runtime.running) {
    if (runtime.timer) clearTimeout(runtime.timer);
    runtime.timer = setTimeout(() => void runtime.tick?.(), 0);
    runtime.timer.unref();
  }
  return true;
}

export async function startSourcePull() {
  if (process.env.NC_CONNECTOR_PULL_ENABLED !== "true" ||
      process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || !["staging", "production"].includes(process.env.NC_DEPLOYMENT_ENV || "")) return;
  const runtime = sourceRuntime();
  if (runtime.started) return;
  runtime.started = true;
  const options = { enabled: true, environment: process.env.NC_DEPLOYMENT_ENV || "production",
    directory: process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"),
  };
  try {
    const { pauseSourceReads } = await import("@/scripts/source-pull-client.mjs");
    pauseSourceReads(options);
  } catch { /* No configured private vault; polling below will retry safely. */ }
  let failures = 0;
  const tick = async () => {
    if (runtime.running) { runtime.requested = true; return; }
    runtime.running = true;
    runtime.requested = false;
    let result: {ok: boolean; complete?: boolean; code?: string} = {ok: false};
    try {
      const { pullSourceOnce } = await import("@/scripts/source-pull-client.mjs");
      result = await pullSourceOnce(options);
    } catch { /* Missing configuration or network loss leaves source-managed reads paused. */ }
    runtime.running = false;
    failures = result.ok ? 0 : Math.min(failures + 1, 5);
    const delay = runtime.requested ? 0 : sourceRetryDelay(result, failures);
    runtime.timer = setTimeout(() => void tick(), delay + (runtime.requested ? 0 : Math.random() * 1000));
    runtime.timer.unref();
  };
  runtime.tick = tick;
  runtime.timer = setTimeout(() => void tick(), 1000);
  runtime.timer.unref();
}
