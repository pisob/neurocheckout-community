export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startSourcePull } = await import("./lib/server-source-pull");
    await startSourcePull();
    const { startAvailabilityHeartbeat } = await import("./lib/server-availability");
    startAvailabilityHeartbeat();
    const { startDataRelay } = await import("./lib/server-data-relay");
    startDataRelay();
  }
}
