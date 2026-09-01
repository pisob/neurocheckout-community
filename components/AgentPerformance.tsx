"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { UiLanguage } from "@/lib/ui-language";

type Shop = {
  id?: string;
  shop_uuid?: string;
  canonical_shop_id?: string;
  shop_id: string;
  platform?: string;
};

type PerformanceItem = {
  agent_name: string;
  mode: "conversion" | "pilotage";
  attributed_revenue?: number | null;
  assisted_revenue?: number | null;
  influenced_revenue?: number | null;
  net_profit_estimated?: number | null;
  total_cost?: number | null;
  roi_profit_net?: number | null;
  open_rate?: number | null;
  click_rate?: number | null;
  cart_conversion_rate?: number | null;
  converted_carts?: number | null;
  abandoned_carts?: number | null;
  impact_label?: string | null;
  impact_value?: number | null;
  impact_unit?: string | null;
  ops_label?: string | null;
  ops_value?: number | null;
  ops_unit?: string | null;
  roi_confidence?: number | null;
  roi_confidence_level?: string | null;
};

type PerformancePayload = {
  shop: Shop & { currency_code?: string | null };
  period: { days: number; start_date?: string | null; end_date?: string | null; timezone?: string | null };
  summary: Record<string, number | null>;
  items: PerformanceItem[];
  detail?: string;
};

const LABELS: Record<UiLanguage, Record<string, string>> = {
  en: {
    abandoned_cart: "Abandoned cart recovery",
    contextual_product_recommendation: "Personalized recommendations",
    intelligent_email_marketing: "Email orchestration",
    business_alerts_anomalies: "Business alerts",
    customer_preference_proactive: "Proactive product advisor",
    upsell_cross_sell_dynamic: "Upsell and cross-sell",
    automatic_customer_segmentation: "Customer segmentation",
  },
  fr: {
    abandoned_cart: "Relance panier abandonné",
    contextual_product_recommendation: "Recommandations personnalisées",
    intelligent_email_marketing: "Orchestration email",
    business_alerts_anomalies: "Alertes business",
    customer_preference_proactive: "Conseiller produit proactif",
    upsell_cross_sell_dynamic: "Upsell et cross-sell",
    automatic_customer_segmentation: "Segmentation client",
  },
};

function shopUuid(shop: Shop): string {
  return String(shop.shop_uuid || shop.id || shop.canonical_shop_id || "").trim();
}

function formatMetric(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const code = String(currency || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(value));
  }
  return formatMetric(value, 2);
}

function readableMetric(value?: string | null): string {
  return String(value || "").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function AgentPerformance({ language, supervisorEnabled }: { language: UiLanguage; supervisorEnabled: boolean }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [days, setDays] = useState(30);
  const [payload, setPayload] = useState<PerformancePayload | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadShops = useCallback(async () => {
    const response = await fetch("/api/cloud/shops", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.detail || ui("Stores unavailable.", "Boutiques indisponibles.")));
    const items = Array.isArray(body?.items) ? body.items as Shop[] : [];
    setShops(items);
    setSelectedShopUuid((current) => current || (items[0] ? shopUuid(items[0]) : ""));
  }, [language]);

  const loadPerformance = useCallback(async () => {
    if (!selectedShopUuid) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ shop_uuid: selectedShopUuid, days: String(days) });
      const response = await fetch(`/api/cloud/agent-performance?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as PerformancePayload;
      if (!response.ok) {
        if (response.status === 403) throw new Error(ui("Reconnect this installation once to grant analytics access.", "Reconnectez cette installation une fois pour autoriser les statistiques."));
        throw new Error(String(body?.detail || ui("Performance unavailable.", "Performances indisponibles.")));
      }
      setPayload(body);
      setSelectedAgent((current) => body.items.some((item) => item.agent_name === current) ? current : body.items[0]?.agent_name || "");
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : ui("Performance unavailable.", "Performances indisponibles."));
    } finally {
      setLoading(false);
    }
  }, [days, language, selectedShopUuid]);

  useEffect(() => {
    void loadShops().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : ui("Stores unavailable.", "Boutiques indisponibles."));
      setLoading(false);
    });
  }, [loadShops]);

  useEffect(() => { void loadPerformance(); }, [loadPerformance]);

  const selected = useMemo(
    () => payload?.items.find((item) => item.agent_name === selectedAgent) || payload?.items[0] || null,
    [payload, selectedAgent],
  );
  const currency = payload?.shop.currency_code;
  const summary = payload?.summary || {};
  const periodLabel = payload?.period.start_date && payload?.period.end_date
    ? `${payload.period.start_date} — ${payload.period.end_date}`
    : ui(`${days} days`, `${days} jours`);

  return (
    <section className="view-enter analytics-view performance-view">
      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <label>{ui("Store", "Boutique")}<select value={selectedShopUuid} onChange={(event) => setSelectedShopUuid(event.target.value)}>{shops.map((shop) => <option key={shopUuid(shop)} value={shopUuid(shop)}>{shop.shop_id} · {shop.platform || "store"}</option>)}</select></label>
          <label>{ui("Period", "Période")}<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>{ui("Last 7 days", "7 derniers jours")}</option><option value={30}>{ui("Last 30 days", "30 derniers jours")}</option><option value={90}>{ui("Last 90 days", "90 derniers jours")}</option></select></label>
        </div>
        <div className="analytics-freshness"><span>{periodLabel}</span><button className="text-action" type="button" onClick={() => void loadPerformance()}>{ui("Refresh", "Actualiser")}</button></div>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {loading ? <div className="operational-state"><span className="loader" /><p>{ui("Calculating agent performance…", "Calcul des performances des agents…")}</p></div> : null}
      {!loading && shops.length === 0 ? <div className="operational-state"><p className="eyebrow">{ui("Store required", "Boutique requise")}</p><h2>{ui("Connect a store to see performance", "Connectez une boutique pour voir les performances")}</h2></div> : null}

      {!loading && payload ? (
        <>
          <div className="analytics-summary" aria-label={ui("Performance summary", "Synthèse des performances")}>
            <div><span>{ui("Attributed revenue", "Revenu attribué")}</span><strong>{formatMoney(summary.attributed_revenue, currency)}</strong></div>
            <div><span>{ui("Attributed orders", "Commandes attribuées")}</span><strong>{formatMetric(summary.orders_attributed, 0)}</strong></div>
            <div><span>{ui("Open rate", "Taux d’ouverture")}</span><strong>{formatMetric(summary.open_rate)}%</strong></div>
            <div><span>{ui("Estimated net ROI", "ROI net estimé")}</span><strong>{formatMetric(summary.roi_profit_net, 2)}x</strong></div>
          </div>

          {supervisorEnabled ? (
            <div className="supervisor-line"><span className="supervisor-mark">S</span><div><strong>Supervisor</strong><small>{ui("Coordinates the active specialists; its value is reflected across their results.", "Coordonne les spécialistes actifs ; sa valeur est reflétée dans leurs résultats.")}</small></div><i>{ui("Coordinating", "Coordination active")}</i></div>
          ) : null}

          {payload.items.length === 0 ? (
            <div className="operational-state"><p className="eyebrow">{ui("No signal", "Aucun signal")}</p><h2>{ui("No agent metric is available for this period", "Aucune métrique agent n’est disponible sur cette période")}</h2></div>
          ) : (
            <div className="analytics-split">
              <div className="agent-performance-list">
                <div className="analytics-list-head"><span>{ui("Agent", "Agent")}</span><span>{ui("Business value", "Valeur métier")}</span><span>{ui("Engagement", "Engagement")}</span></div>
                {payload.items.map((item, index) => (
                  <button className={selected?.agent_name === item.agent_name ? "active" : ""} key={item.agent_name} type="button" onClick={() => setSelectedAgent(item.agent_name)}>
                    <span className="analytics-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="analytics-agent-name"><strong>{LABELS[language][item.agent_name] || readableMetric(item.agent_name)}</strong><small>{item.mode === "conversion" ? ui("Conversion", "Conversion") : ui("Operations", "Pilotage")}</small></span>
                    <span><strong>{item.mode === "conversion" ? formatMoney(item.attributed_revenue ?? item.assisted_revenue, currency) : formatMetric(item.impact_value)}</strong><small>{item.mode === "conversion" ? ui("attributed", "attribué") : readableMetric(item.impact_label)}</small></span>
                    <span><strong>{item.open_rate === null || item.open_rate === undefined ? "—" : `${formatMetric(item.open_rate)}%`}</strong><small>{ui("open rate", "ouverture")}</small></span>
                  </button>
                ))}
              </div>

              {selected ? (
                <aside className="analytics-inspector">
                  <p className="eyebrow">{selected.mode === "conversion" ? ui("Conversion agent", "Agent de conversion") : ui("Operational agent", "Agent de pilotage")}</p>
                  <h2>{LABELS[language][selected.agent_name] || readableMetric(selected.agent_name)}</h2>
                  <code>{selected.agent_name}</code>
                  <dl>
                    {selected.mode === "conversion" ? (
                      <>
                        <div><dt>{ui("Attributed revenue", "Revenu attribué")}</dt><dd>{formatMoney(selected.attributed_revenue, currency)}</dd></div>
                        <div><dt>{ui("Assisted revenue", "Revenu assisté")}</dt><dd>{formatMoney(selected.assisted_revenue, currency)}</dd></div>
                        <div><dt>{ui("Estimated net profit", "Profit net estimé")}</dt><dd>{formatMoney(selected.net_profit_estimated, currency)}</dd></div>
                        <div><dt>{ui("Click rate", "Taux de clic")}</dt><dd>{selected.click_rate === null || selected.click_rate === undefined ? "—" : `${formatMetric(selected.click_rate)}%`}</dd></div>
                      </>
                    ) : (
                      <>
                        <div><dt>{readableMetric(selected.impact_label) || ui("Impact", "Impact")}</dt><dd>{formatMetric(selected.impact_value)}{selected.impact_unit === "percent" ? "%" : ""}</dd></div>
                        <div><dt>{readableMetric(selected.ops_label) || ui("Operations", "Opérations")}</dt><dd>{formatMetric(selected.ops_value)}{selected.ops_unit === "percent" ? "%" : ""}</dd></div>
                      </>
                    )}
                  </dl>
                  <div className="confidence-line"><span>{ui("Data confidence", "Confiance des données")}</span><strong>{selected.roi_confidence_level ? readableMetric(selected.roi_confidence_level) : ui("Operational", "Opérationnelle")}</strong></div>
                </aside>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
