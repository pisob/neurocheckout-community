import { updateFailureCode } from './update-health.mjs';
// Keep the old build selected until the replacement passes its health check.
export async function activateCandidate(candidate, current, operations) {
  await operations.stop();
  let stage = 'backup';
  try {
    // Snapshot only after the server stops: include SQLite WAL and all stores.
    await operations.backup?.();
    stage = 'activation';
    await operations.start(candidate);
    if (!(await operations.healthy())) throw new Error("candidate_unhealthy");
    await operations.commit(candidate);
    return { current: candidate, phase: "complete" };
  } catch (error) {
    await operations.stop();
    await operations.start(current);
    if (!(await operations.healthy())) throw new Error("rollback_unhealthy");
    return { current, phase: "rolled_back", errorCode: updateFailureCode(error, stage) };
  }
}
