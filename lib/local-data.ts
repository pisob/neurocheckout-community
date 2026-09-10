import { resolve } from "node:path";

export async function localDataRequest(request: Request, role: "read" | "write") {
  if (process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" || process.env.NC_DEPLOYMENT_ENV !== "staging") {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const { handleLocalData } = await import("@/scripts/local-data-handler.mjs");
  return handleLocalData(request, role, {
    directory: process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state"),
    enabled: true, environment: "staging",
  });
}
