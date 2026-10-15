// Evidence is deliberately not an authorization to send an email.
export type EvidenceState = "verified" | "pending" | "blocked" | "unknown";
export type ReliabilityStage = { id: string; state: EvidenceState; en: string; fr: string };
type Health = {
  online: boolean; generated_at?: string;
  queue: { pending: number; processing: number; retrying: number; failed: number };
  data_quality: { incomplete: number };
  evidence: { received: number; sent: number; converted: number };
  latest_issue?: string | null;
  issue_active?: boolean;
};
type Local = {
  available: boolean; configured: boolean; ready: boolean; shop_id?: string;
  source?: { diagnostic?: { code: string; checked_at: number } | null; last_complete_at?: number | null };
  outbox?: { pending: number };
};
export function validCloudHealth(value: unknown): value is Health & { state: string } {
  if (!value || typeof value !== "object") return false;
  const health = value as Health & { state?: string };
  return Boolean(health.queue && health.data_quality && health.evidence &&
    typeof health.online === "boolean" &&
    ["healthy", "synchronizing", "recovering", "attention", "offline"].includes(health.state || "") &&
    [health.queue.pending, health.queue.processing, health.queue.retrying, health.queue.failed,
      health.data_quality.incomplete, health.evidence.received, health.evidence.sent, health.evidence.converted]
      .every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0));
}
export function reliabilityStages(cloud: Health | null, local: Local | null, shopId: string, now = Date.now()): ReliabilityStage[] {
  const matches = Boolean(local?.available && local.shop_id === shopId);
  const diagnostic = matches ? local?.source?.diagnostic : null;
  const age = now - (diagnostic?.checked_at ?? 0);
  const fresh = Boolean(diagnostic && age >= -30_000 && age <= 120_000);
  const completeAge = now - (local?.source?.last_complete_at ?? 0);
  const sourceReady = matches && local?.configured && local.ready && fresh && diagnostic?.code === "ok" && completeAge >= -5000 && completeAge <= 60_000;
  const sourceBlocked = matches && (!local?.configured || (fresh && diagnostic?.code !== "ok"));
  const blocked = !cloud?.online || !sourceReady || cloud.queue.failed > 0 || cloud.data_quality.incomplete > 0;
  const pending = Boolean(cloud && (cloud.queue.pending || cloud.queue.processing || cloud.queue.retrying || (matches && local?.outbox?.pending)));
  const issue = cloud?.latest_issue;
  const deliveryBlocked = cloud?.issue_active !== false && issue && ["delivery_uncertain", "quota_blocked", "cart_products_unavailable", "record_invalid"].includes(issue);
  return [
    { id: "connection", state: !cloud ? "unknown" : cloud.online ? "verified" : "blocked", en: "Cloud connection", fr: "Connexion Cloud" },
    { id: "source", state: sourceReady ? "verified" : sourceBlocked ? "blocked" : matches && fresh ? "pending" : "unknown", en: "Current store data", fr: "Données récentes de la boutique" },
    { id: "events", state: !cloud ? "unknown" : cloud.evidence.received > 0 ? "verified" : "pending", en: "Events received by Cloud", fr: "Événements reçus par le Cloud" },
    { id: "processing", state: !cloud ? "unknown" : blocked ? "blocked" : pending ? "pending" : "verified", en: "Reconciliation queues", fr: "Files de réconciliation" },
    { id: "eligibility", state: !cloud ? "unknown" : blocked || deliveryBlocked ? "blocked" : "pending", en: "Sending eligibility: checked per cart by Cloud", fr: "Admissibilité d’envoi : contrôlée par panier par le Cloud" },
    { id: "delivery", state: !cloud ? "unknown" : cloud.evidence.sent > 0 ? "verified" : "pending", en: "Recorded email sends (not inbox receipt)", fr: "Envois enregistrés (pas une preuve de réception)" },
    { id: "conversion", state: !cloud ? "unknown" : cloud.evidence.converted > 0 ? "verified" : "pending", en: "Attributed conversions", fr: "Conversions attribuées" },
  ];
}

export function quotaObservation(emails: { used?: number | null; remaining?: number | null } | undefined, checkedAt: number | null, failed: boolean, now: number, maxAgeMs: number) {
  const age = checkedAt == null ? Infinity : now - checkedAt;
  const fresh = !failed && age >= -30_000 && age <= maxAgeMs;
  const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
  return { fresh, used: fresh && valid(emails?.used) ? emails.used : null, remaining: fresh && valid(emails?.remaining) ? emails.remaining : null };
}

export function emailStatusTotal(counts: Record<string, number | null> | undefined, status: string): number | null {
  const names = status === "all" ? ["sent", "delivered", "opened", "clicked", "converted", "bounced"] : [status];
  const values = names.map((name) => counts?.[name]);
  return values.every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    ? (values as number[]).reduce((sum, value) => sum + value, 0) : null;
}
