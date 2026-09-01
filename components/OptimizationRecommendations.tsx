"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { UiLanguage } from "@/lib/ui-language";

type Recommendation = {
  id: string;
  category?: string | null;
  priority?: string | null;
  confidence?: number | null;
  title?: string | null;
  description?: string | null;
  current_metric?: number | null;
  benchmark?: number | null;
  estimated_impact_pct?: number | null;
  application_status?: string | null;
  supervisor_takeover_due_at?: string | null;
};

type OptimizationPayload = {
  settings: {
    supervisor_auto_apply_enabled: boolean;
    supervisor_auto_apply_after_days: number;
    consented_at?: string | null;
    updated_at?: string | null;
  };
  summary: {
    count: number;
    pending_count: number;
    high_priority_count: number;
  };
  access: {
    manual_application: boolean;
    supervisor_automation: boolean;
  };
  recommendations: Recommendation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePayload(value: unknown): OptimizationPayload | null {
  if (!isRecord(value) || !isRecord(value.settings) || !isRecord(value.summary) || !isRecord(value.access) || !Array.isArray(value.recommendations)) return null;
  const settings = value.settings;
  const summary = value.summary;
  return {
    settings: {
      supervisor_auto_apply_enabled: Boolean(settings.supervisor_auto_apply_enabled),
      supervisor_auto_apply_after_days: Math.max(1, Number(settings.supervisor_auto_apply_after_days) || 3),
      consented_at: typeof settings.consented_at === "string" ? settings.consented_at : null,
      updated_at: typeof settings.updated_at === "string" ? settings.updated_at : null,
    },
    summary: {
      count: Math.max(0, Number(summary.count) || 0),
      pending_count: Math.max(0, Number(summary.pending_count) || 0),
      high_priority_count: Math.max(0, Number(summary.high_priority_count) || 0),
    },
    access: {
      manual_application: Boolean(value.access.manual_application),
      supervisor_automation: Boolean(value.access.supervisor_automation),
    },
    recommendations: value.recommendations.filter(
      (item): item is Recommendation => isRecord(item) && typeof item.id === "string",
    ),
  };
}

function metric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function OptimizationRecommendations({
  days,
  language,
  shopUuid,
}: {
  days: number;
  language: UiLanguage;
  shopUuid: string;
}) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [payload, setPayload] = useState<OptimizationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const load = useCallback(async () => {
    if (!shopUuid) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ shop_uuid: shopUuid, days: String(days) });
      const response = await fetch(`/api/cloud/optimization-recommendations?${query.toString()}`, { cache: "no-store" });
      const raw: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = isRecord(raw) ? String(raw.detail || "") : "";
        throw new Error(detail || ui("Optimization recommendations are unavailable.", "Les recommandations d’optimisation sont indisponibles."));
      }
      const next = normalizePayload(raw);
      if (!next) throw new Error(ui("Cloud returned an invalid optimization response.", "Le Cloud a renvoyé une réponse d’optimisation invalide."));
      setPayload(next);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : ui("Optimization recommendations are unavailable.", "Les recommandations d’optimisation sont indisponibles."));
    } finally {
      setLoading(false);
    }
  }, [days, language, shopUuid]);

  useEffect(() => { void load(); }, [load]);

  const toggleSupervisor = async () => {
    if (!payload || saving) return;
    setSaving(true);
    setError("");
    setNeedsReconnect(false);
    try {
      const response = await fetch("/api/cloud/optimization-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_uuid: shopUuid,
          supervisor_auto_apply_enabled: !payload.settings.supervisor_auto_apply_enabled,
        }),
      });
      const raw: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = isRecord(raw) ? String(raw.detail || "") : "";
        if (response.status === 403 || detail === "community_scope_required") setNeedsReconnect(true);
        throw new Error(
          response.status === 403
            ? ui("Reconnect this installation once to authorize Supervisor settings.", "Reconnectez cette installation une fois pour autoriser les réglages du Supervisor.")
            : detail || ui("The Supervisor setting could not be saved.", "Le réglage du Supervisor n’a pas pu être enregistré."),
        );
      }
      if (!isRecord(raw) || !isRecord(raw.settings)) throw new Error(ui("Cloud did not confirm the setting.", "Le Cloud n’a pas confirmé le réglage."));
      const confirmedSettings = raw.settings;
      setPayload((current) => current ? {
        ...current,
        settings: {
          ...current.settings,
          supervisor_auto_apply_enabled: Boolean(confirmedSettings.supervisor_auto_apply_enabled),
          supervisor_auto_apply_after_days: Math.max(1, Number(confirmedSettings.supervisor_auto_apply_after_days) || 3),
          consented_at: typeof confirmedSettings.consented_at === "string" ? confirmedSettings.consented_at : null,
          updated_at: typeof confirmedSettings.updated_at === "string" ? confirmedSettings.updated_at : null,
        },
      } : current);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : ui("The Supervisor setting could not be saved.", "Le réglage du Supervisor n’a pas pu être enregistré."));
    } finally {
      setSaving(false);
    }
  };

  const statusCopy = useMemo(() => {
    const pending = payload?.summary.pending_count || 0;
    const automatic = payload?.settings.supervisor_auto_apply_enabled || false;
    const delay = payload?.settings.supervisor_auto_apply_after_days || 3;
    if (!pending) {
      return {
        recommendation: ui("Your AI agents are operating optimally.", "Vos agents IA fonctionnent de façon optimale."),
        automation: automatic
          ? ui(`Active: future pending recommendations will be applied after ${delay} days.`, `Actif : les futures recommandations en attente seront appliquées après ${delay} jours.`)
          : ui("Manual control: future recommendations will wait for your decision.", "Contrôle manuel : les futures recommandations attendront votre décision."),
        next: ui("No manual action is required. Keep monitoring the KPI trend.", "Aucune action manuelle n’est requise. Continuez à suivre la tendance des KPI."),
      };
    }
    return {
      recommendation: ui(`${pending} recommendation${pending === 1 ? " is" : "s are"} awaiting action.`, `${pending} recommandation${pending === 1 ? " attend" : "s attendent"} une action.`),
      automation: automatic
        ? ui(`Supervisor takeover is active after ${delay} days.`, `La prise en charge par le Supervisor est active après ${delay} jours.`)
        : ui("Supervisor takeover is disabled.", "La prise en charge par le Supervisor est désactivée."),
      next: automatic
        ? ui("The Cloud will apply eligible pending recommendations automatically.", "Le Cloud appliquera automatiquement les recommandations en attente éligibles.")
        : ui("Review the recommendations in NeuroCheckout Cloud or enable Supervisor automation.", "Consultez les recommandations dans NeuroCheckout Cloud ou activez l’automatisation du Supervisor."),
    };
  }, [language, payload]);

  if (!shopUuid) return null;

  return (
    <section className="optimization-center" aria-labelledby="optimization-title">
      <header className="optimization-head">
        <div>
          <p className="eyebrow">{ui("AI optimization recommendations", "Recommandations d’optimisation IA")}</p>
          <h2 id="optimization-title">{ui("Intelligent actions ready to be applied", "Actions intelligentes prêtes à être appliquées")}</h2>
        </div>
        <div className="optimization-counts" aria-label={ui("Recommendation counts", "Nombre de recommandations")}>
          <span>{payload?.summary.count || 0} {ui("recommendations", "recommandations")}</span>
          <span className="priority">{payload?.summary.high_priority_count || 0} {ui("high priority", "priorité haute")}</span>
        </div>
      </header>

      {loading ? <div className="optimization-loading"><span className="loader" />{ui("Synchronizing with Cloud…", "Synchronisation avec le Cloud…")}</div> : null}
      {error ? <div className="optimization-error" role="alert"><span>{error}</span>{needsReconnect ? <a href="/api/auth/start">{ui("Reconnect Cloud access", "Reconnecter l’accès Cloud")}</a> : <button type="button" onClick={() => void load()}>{ui("Retry", "Réessayer")}</button>}</div> : null}

      {!loading && payload ? (
        <>
          <div className="optimization-mode-line">
            <i />
            <span>{ui(
              `Community mode · ${payload.summary.count} recommendation(s) detected. Decisions remain calculated and executed in NeuroCheckout Cloud.`,
              `Mode Community · ${payload.summary.count} recommandation(s) détectée(s). Les décisions restent calculées et exécutées dans NeuroCheckout Cloud.`,
            )}</span>
          </div>

          <div className="supervisor-takeover">
            <div>
              <p className="eyebrow">{ui("Supervisor takeover", "Prise en charge par le Supervisor")}</p>
              <h3>{ui("Keep optimization moving without losing control", "Faites avancer l’optimisation sans perdre le contrôle")}</h3>
              <p>{ui(
                `Eligible recommendations still pending after ${payload.settings.supervisor_auto_apply_after_days} days can be applied automatically by the Supervisor. This setting only affects future pending recommendations.`,
                `Les recommandations éligibles encore en attente après ${payload.settings.supervisor_auto_apply_after_days} jours peuvent être appliquées automatiquement par le Supervisor. Ce réglage concerne uniquement les futures recommandations en attente.`,
              )}</p>
            </div>
            <button
              aria-checked={payload.settings.supervisor_auto_apply_enabled}
              className={`supervisor-switch ${payload.settings.supervisor_auto_apply_enabled ? "enabled" : ""}`}
              disabled={saving || !payload.access.supervisor_automation}
              onClick={() => void toggleSupervisor()}
              role="switch"
              type="button"
            >
              <span aria-hidden="true"><i /></span>
              <strong>{saving ? ui("Saving…", "Enregistrement…") : payload.settings.supervisor_auto_apply_enabled ? ui("Automatic application enabled", "Application automatique activée") : ui("Enable automatic application", "Activer l’application automatique")}</strong>
            </button>
          </div>

          <div className="optimization-status-grid">
            <article><p className="eyebrow">{ui("Recommendation status", "État des recommandations")}</p><strong>{statusCopy.recommendation}</strong></article>
            <article><p className="eyebrow">{ui("Supervisor automation", "Automatisation du Supervisor")}</p><strong>{statusCopy.automation}</strong></article>
            <article><p className="eyebrow">{ui("Next action", "Prochaine action")}</p><strong>{statusCopy.next}</strong></article>
          </div>

          {payload.recommendations.length ? (
            <div className="optimization-list" aria-label={ui("Current recommendations", "Recommandations actuelles")}>
              {payload.recommendations.map((item) => (
                <article key={item.id}>
                  <div><span className={`recommendation-priority ${String(item.priority || "").toLowerCase()}`}>{item.priority || ui("normal", "normale")}</span><small>{item.category || ui("optimization", "optimisation")}</small></div>
                  <div><strong>{item.title || ui("Optimization opportunity", "Opportunité d’optimisation")}</strong><p>{item.description || ui("Cloud has detected an actionable improvement.", "Le Cloud a détecté une amélioration exploitable.")}</p></div>
                  <dl><div><dt>{ui("Current", "Actuel")}</dt><dd>{metric(item.current_metric)}</dd></div><div><dt>{ui("Target", "Cible")}</dt><dd>{metric(item.benchmark)}</dd></div><div><dt>{ui("Estimated impact", "Impact estimé")}</dt><dd>{item.estimated_impact_pct === null || item.estimated_impact_pct === undefined ? "—" : `+${metric(item.estimated_impact_pct)}%`}</dd></div></dl>
                </article>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
