import { resolve } from "node:path";

export async function startSourcePull() {
  if (process.env.NC_CONNECTOR_PULL_ENABLED !== "true" ||
      process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || process.env.NC_DEPLOYMENT_ENV !== "staging") return;
  const state = globalThis as typeof globalThis & { communitySourcePullStarted?: boolean };
  if (state.communitySourcePullStarted) return;
  state.communitySourcePullStarted = true;
  const options = { enabled: true, environment: "staging",
    directory: process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"),
  };
  try {
    const { pauseSourceReads } = await import("@/scripts/source-pull-client.mjs");
    pauseSourceReads(options);
  } catch { /* No configured private vault; polling below will retry safely. */ }
  let failures = 0;
  const tick = async () => {
    let ok = false, complete = false;
    try {
      const { pullSourceOnce } = await import("@/scripts/source-pull-client.mjs");
      const result = await pullSourceOnce(options);
      ok = result.ok; complete = result.complete === true;
    } catch { /* Missing configuration or network loss leaves source-managed reads paused. */ }
    failures = ok ? 0 : Math.min(failures + 1, 5);
    const delay = ok ? (complete ? 15_000 : 1000) : Math.min(30_000, 1000 * 2 ** failures);
    setTimeout(tick, delay + Math.random() * 1000).unref();
  };
  setTimeout(tick, 1000).unref();
}
