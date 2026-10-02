import { workspaceChildDirectories } from "@/scripts/workspace-store.mjs";
import { workspaceRoot } from "@/lib/workspace";
import { cloudApiBaseUrl, communityClientId, sessionSecret, workspaceEnabled } from "@/lib/config";
import { relayOnce } from "@/scripts/server-data-relay.mjs";
import { heartbeatOnce } from "@/scripts/server-availability.mjs";
import { pullSourceOnce, pauseSourceReads } from "@/scripts/source-pull-client.mjs";
import { version } from "@/package.json";

const runtime = globalThis as typeof globalThis & { communityWorkspaceRequests?: Map<string, () => void> };
runtime.communityWorkspaceRequests ||= new Map();
export function requestWorkspaceRun(directory: string): boolean {
  const request = runtime.communityWorkspaceRequests?.get(directory);
  request?.();
  return Boolean(request);
}

// Each child owns its timers, backoff and vault. A slow/offline shop cannot stall
// the parent's existing loops or another shop. No credentials enter the browser.
export function startWorkspaceWorkers() {
  if (!workspaceEnabled() || process.env.NC_DEPLOYMENT_ENV !== "staging" ||
      process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true") return;
  const state = globalThis as typeof globalThis & { communityWorkspaceStarted?: boolean };
  if (state.communityWorkspaceStarted) return;
  state.communityWorkspaceStarted = true;
  const workers = new Map<string, symbol>();
  const scan = () => {
    try {
      const directories = workspaceChildDirectories(workspaceRoot());
      for (const directory of workers.keys()) if (!directories.includes(directory)) {
        workers.delete(directory); runtime.communityWorkspaceRequests!.delete(directory);
      }
      for (const directory of directories) {
        if (workers.has(directory)) continue;
        const generation = Symbol(); workers.set(directory, generation);
        const active = () => workers.get(directory) === generation;
        const options = { enabled: true, environment: "staging", directory, secret: sessionSecret(),
          cloudUrl: cloudApiBaseUrl(), clientId: communityClientId(), port: process.env.PORT || "3400", version };
        try { pauseSourceReads(options); } catch { /* Setup may still be completing. */ }
        let relayFailures = 0;
        const relay = async () => {
          if (!active()) return;
          let ok = false;
          try { ok = await relayOnce(options); } catch { /* Fail closed and retry. */ }
          relayFailures = ok ? 0 : Math.min(relayFailures + 1, 5);
          if (active()) setTimeout(relay, ok ? 250 : Math.min(30_000, 1000 * 2 ** relayFailures)).unref();
        };
        let sourceRunning = false, sourceRequested = false;
        let sourceTimer: ReturnType<typeof setTimeout> | undefined;
        const source = async () => {
          if (!active()) return;
          if (sourceRunning) { sourceRequested = true; return; }
          sourceRunning = true; sourceRequested = false;
          let delay = 30_000;
          try {
            // Re-check the live parent/link/offer before reading the connector.
            const authorized = await heartbeatOnce(options);
            if (!authorized) pauseSourceReads(options);
            else if (process.env.NC_CONNECTOR_PULL_ENABLED === "true") {
              const result = await pullSourceOnce(options);
              delay = result.ok ? (result.complete ? 15_000 : 1000) : 30_000;
            }
          } catch { try { pauseSourceReads(options); } catch { /* No readable vault. */ } }
          sourceRunning = false;
          if (!active()) return;
          sourceTimer = setTimeout(source, sourceRequested ? 0 : delay);
          sourceTimer.unref();
        };
        runtime.communityWorkspaceRequests!.set(directory, () => {
          sourceRequested = true;
          if (!sourceRunning) {
            if (sourceTimer) clearTimeout(sourceTimer);
            sourceTimer = setTimeout(source, 0); sourceTimer.unref();
          }
        });
        void relay(); void source();
      }
    } catch { /* Workspace may not be configured yet. */ }
    setTimeout(scan, 10_000).unref();
  };
  setTimeout(scan, 1000).unref();
}
