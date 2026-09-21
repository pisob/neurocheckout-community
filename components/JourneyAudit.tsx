"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { publicEnumLabel, publicErrorMessage } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";

type Shop = {
  id?: string;
  shop_uuid?: string;
  canonical_shop_id?: string;
  shop_id: string;
  platform?: string;
  currency_code?: string | null;
};

type EventSummary = {
  total_events?: number;
  unique_sessions?: number;
  product_views?: number;
  add_to_cart_intents?: number;
  cart_views?: number;
  cart_snapshots?: number;
  checkout_starts?: number;
  order_completed?: number;
  orders_received?: number;
  attributed_orders?: number;
  cart_recovery_conversions?: number;
  resolved_revenue?: number;
  resolved_revenue_by_currency?: Array<{ currency_code: string; amount: number }>;
};

type JourneySession = {
  session_key: string;
  lifecycle_state?: string | null;
  event_count?: number | null;
  estimated_cart_value?: number | null;
  currency_code?: string | null;
  cart_id?: string | null;
  last_seen?: string | null;
  last_event_type?: string | null;
  customer_display?: {
    primary?: string | null;
    secondary?: string | null;
    masked_email?: string | null;
    cart_id?: string | null;
    platform_label?: string | null;
  } | null;
  priority?: { level?: string | null; score?: number | null; reasons?: string[] | null } | null;
  action_status?: { state?: string | null; delivery_state?: string | null } | null;
  outcome?: { status?: string | null; order_id?: string | null; order_total?: number | null; currency_code?: string | null } | null;
  products_viewed?: string[] | null;
  cart_items?: string[] | null;
};

type AuditRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  journey_summary?: { summary_text?: string | null; lifecycle_state?: string | null } | null;
  revenue_leaks?: Array<{ severity?: string | null; summary?: string | null; estimated_value?: number | null }> | null;
  recommended_actions?: Array<{ label?: string | null; next_step?: string | null; owner_agent?: string | null }> | null;
};

type JourneyPayload = {
  shop: Shop;
  period_days: number;
  period_from?: string | null;
  period_to?: string | null;
  audit_count: number;
  state: string;
  event_summary: EventSummary;
  recent_sessions: JourneySession[];
  recent_audits: AuditRow[];
  journey_pagination?: {
    page?: number;
    total_pages?: number;
    total_items?: number;
    filter_counts?: Record<string, number>;
  } | null;
  privacy?: { customer_data?: string | null } | null;
};

const EMPTY_SUMMARY: EventSummary = {};

function shopUuid(shop: Shop): string {
  return String(shop.shop_uuid || shop.id || shop.canonical_shop_id || "").trim();
}

function formatNumber(value: unknown, language: UiLanguage): string {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString(language === "fr" ? "fr-FR" : "en-US") : "0";
}

function formatMoney(value: unknown, currency: string | null | undefined, language: UiLanguage): string {
  const parsed = Number(value || 0);
  const code = String(currency || "USD").toUpperCase();
  if (!Number.isFinite(parsed)) return "—";
  try {
    return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(code) ? code : "USD",
      maximumFractionDigits: 2,
    }).format(parsed);
  } catch {
    return `${parsed.toFixed(2)} ${code}`;
  }
}

function formatDate(value: string | null | undefined, language: UiLanguage): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(language === "fr" ? "fr-FR" : "en-US");
}

function resolvedRevenue(summary: EventSummary, fallbackCurrency: string | null | undefined, language: UiLanguage): string {
  const amounts = summary.resolved_revenue_by_currency || [];
  if (amounts.length) return amounts.map((item) => formatMoney(item.amount, item.currency_code, language)).join(" + ");
  return formatMoney(summary.resolved_revenue, fallbackCurrency, language);
}

export default function JourneyAudit({ language }: { language: UiLanguage }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<JourneyPayload | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadShops = useCallback(async () => {
    const response = await fetch("/api/cloud/shops", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(publicErrorMessage(
      body?.detail,
      { en: "Stores unavailable.", fr: "Boutiques indisponibles." },
      language,
    ));
    const items = Array.isArray(body?.items) ? body.items as Shop[] : [];
    setShops(items);
    setSelectedShopUuid((current) => current || (items[0] ? shopUuid(items[0]) : ""));
  }, [language]);

  const loadAudit = useCallback(async () => {
    if (!selectedShopUuid) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        shop_uuid: selectedShopUuid,
        days: String(days),
        limit: "10",
        session_page: String(page),
        session_filter: filter,
      });
      const response = await fetch(`/api/cloud/journey-audit?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) throw new Error(ui("Reconnect this installation once to grant journey audit access.", "Reconnectez cette installation une fois pour autoriser l’audit de parcours."));
        throw new Error(publicErrorMessage(
          body?.detail,
          { en: "Journey audit unavailable.", fr: "Audit de parcours indisponible." },
          language,
        ));
      }
      const nextPayload = body as JourneyPayload;
      const sessions = Array.isArray(nextPayload.recent_sessions) ? nextPayload.recent_sessions : [];
      setPayload({ ...nextPayload, recent_sessions: sessions, recent_audits: Array.isArray(nextPayload.recent_audits) ? nextPayload.recent_audits : [] });
      setSelectedSessionKey((current) => sessions.some((item) => item.session_key === current) ? current : sessions[0]?.session_key || "");
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : ui("Journey audit unavailable.", "Audit de parcours indisponible."));
    } finally {
      setLoading(false);
    }
  }, [days, filter, language, page, selectedShopUuid]);

  useEffect(() => {
    void loadShops().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : ui("Stores unavailable.", "Boutiques indisponibles."));
      setLoading(false);
    });
  }, [loadShops]);

  useEffect(() => { void loadAudit(); }, [loadAudit]);

  const selectedSession = useMemo(
    () => payload?.recent_sessions.find((item) => item.session_key === selectedSessionKey) || payload?.recent_sessions[0] || null,
    [payload, selectedSessionKey],
  );
  const summary = payload?.event_summary || EMPTY_SUMMARY;
  const selectedShop = shops.find((shop) => shopUuid(shop) === selectedShopUuid);
  const orders = Number(summary.orders_received || summary.order_completed || 0);
  const funnel = [
    { label: ui("Product views", "Vues produit"), value: Number(summary.product_views || 0) },
    { label: ui("Add-to-cart", "Ajouts panier"), value: Number(summary.add_to_cart_intents || 0) },
    { label: ui("Checkout starts", "Débuts checkout"), value: Number(summary.checkout_starts || 0) },
    { label: ui("Orders received", "Commandes reçues"), value: orders },
  ];
  const funnelMax = Math.max(1, ...funnel.map((item) => item.value));
  const totalPages = Math.max(1, Number(payload?.journey_pagination?.total_pages || 1));

  return (
    <section className="view-enter analytics-view journey-view">
      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <label>{ui("Store", "Boutique")}<select value={selectedShopUuid} onChange={(event) => { setSelectedShopUuid(event.target.value); setPage(1); }}>{shops.map((shop) => <option key={shopUuid(shop)} value={shopUuid(shop)}>{shop.shop_id} · {shop.platform || "store"}</option>)}</select></label>
          <label>{ui("Period", "Période")}<select value={days} onChange={(event) => { setDays(Number(event.target.value)); setPage(1); }}><option value={7}>{ui("Last 7 days", "7 derniers jours")}</option><option value={30}>{ui("Last 30 days", "30 derniers jours")}</option><option value={90}>{ui("Last 90 days", "90 derniers jours")}</option></select></label>
          <label>{ui("Journey", "Parcours")}<select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="all">{ui("All signals", "Tous les signaux")}</option><option value="high">{ui("High priority", "Priorité haute")}</option><option value="cart">{ui("Lost cart", "Panier perdu")}</option><option value="checkout">{ui("Checkout blocked", "Checkout bloqué")}</option><option value="friction">{ui("Friction", "Friction")}</option><option value="converted">{ui("Converted", "Converti")}</option><option value="identified">{ui("Findable customer", "Client retrouvable")}</option></select></label>
        </div>
        <div className="analytics-freshness"><span>{payload?.period_from && payload?.period_to ? `${formatDate(payload.period_from, language)} — ${formatDate(payload.period_to, language)}` : ""}</span><button className="text-action" type="button" onClick={() => void loadAudit()}>{ui("Refresh", "Actualiser")}</button></div>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {loading ? <div className="operational-state"><span className="loader" /><p>{ui("Analyzing customer journeys…", "Analyse des parcours clients…")}</p></div> : null}
      {!loading && shops.length === 0 ? <div className="operational-state"><p className="eyebrow">{ui("Store required", "Boutique requise")}</p><h2>{ui("Connect a store to audit journeys", "Connectez une boutique pour auditer les parcours")}</h2></div> : null}

      {!loading && payload ? (
        <>
          <div className="journey-state-line"><span className="status-pill"><span className="status-dot" />{publicEnumLabel(payload.state, language, ui("Available", "Disponible"))}</span><span>{formatNumber(payload.journey_pagination?.total_items || payload.recent_sessions.length, language)} {ui("journeys in this view", "parcours dans cette vue")}</span></div>
          <div className="journey-summary" aria-label={ui("Journey summary", "Synthèse du parcours") }>
            <div><span>{ui("Generated audits", "Audits générés")}</span><strong>{formatNumber(payload.audit_count, language)}</strong><small>{ui("Actionable snapshots", "Snapshots exploitables")}</small></div>
            <div><span>{ui("Journey events", "Événements parcours")}</span><strong>{formatNumber(summary.total_events, language)}</strong><small>{formatNumber(summary.unique_sessions, language)} {ui("sessions", "sessions")}</small></div>
            <div><span>{ui("Cart snapshots", "Paniers suivis")}</span><strong>{formatNumber(summary.cart_snapshots, language)}</strong><small>{formatNumber(summary.cart_recovery_conversions, language)} {ui("recovered", "récupérés")}</small></div>
            <div><span>{ui("Attributed conversions", "Conversions attribuées")}</span><strong>{formatNumber(summary.attributed_orders, language)}</strong><small>{ui("Orders linked to agents", "Commandes reliées aux agents")}</small></div>
            <div className="journey-revenue"><span>{ui("Resolved revenue", "Revenu résolu")}</span><strong>{resolvedRevenue(summary, selectedShop?.currency_code, language)}</strong><small>{ui("Value attributed to agents", "Valeur attribuée aux agents")}</small></div>
          </div>

          <section className="journey-funnel" aria-label={ui("Revenue funnel", "Entonnoir de revenu") }>
            <div><p className="eyebrow">{ui("Revenue funnel", "Entonnoir de revenu")}</p><h2>{ui("Where the journey stops", "Où le parcours s’arrête")}</h2></div>
            <div className="journey-funnel-bars">{funnel.map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${Math.max(item.value > 0 ? 4 : 0, (item.value / funnelMax) * 100)}%` }} /></i><strong>{formatNumber(item.value, language)}</strong></div>)}</div>
          </section>

          {payload.recent_sessions.length ? (
            <div className="journey-workspace">
              <div className="journey-session-list">
                <div className="journey-list-head"><span>{ui("Recent journeys", "Parcours récents")}</span><span>{ui("Priority", "Priorité")}</span></div>
                {payload.recent_sessions.map((session, index) => {
                  const customer = session.customer_display?.primary || session.customer_display?.masked_email || ui("Protected visitor", "Visiteur protégé");
                  return <button className={selectedSession?.session_key === session.session_key ? "active" : ""} key={session.session_key} type="button" onClick={() => setSelectedSessionKey(session.session_key)}><span className="analytics-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{customer}</strong><small>{publicEnumLabel(session.lifecycle_state, language, ui("Observed journey", "Parcours observé"))} · {formatDate(session.last_seen, language)}</small></span><span><strong>{publicEnumLabel(session.priority?.level, language, ui("Normal", "Normale"))}</strong><small>{formatNumber(session.event_count, language)} {ui("events", "événements")}</small></span></button>;
                })}
                <div className="journey-pagination"><button className="text-action" disabled={page <= 1} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>{ui("Previous", "Précédent")}</button><span>{page} / {totalPages}</span><button className="text-action" disabled={page >= totalPages} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{ui("Next", "Suivant")}</button></div>
              </div>

              {selectedSession ? (
                <aside className="journey-inspector">
                  <p className="eyebrow">{ui("Journey evidence", "Preuve du parcours")}</p>
                  <h2>{selectedSession.customer_display?.primary || selectedSession.customer_display?.masked_email || ui("Protected visitor", "Visiteur protégé")}</h2>
                  <p>{selectedSession.customer_display?.secondary || `${ui("Cart", "Panier")} ${selectedSession.cart_id || selectedSession.customer_display?.cart_id || "—"}`}</p>
                  <dl>
                    <div><dt>{ui("Lifecycle", "Cycle")}</dt><dd>{publicEnumLabel(selectedSession.lifecycle_state, language)}</dd></div>
                    <div><dt>{ui("Last signal", "Dernier signal")}</dt><dd>{publicEnumLabel(selectedSession.last_event_type, language, ui("Activity received", "Activité reçue"))}</dd></div>
                    <div><dt>{ui("Cart value", "Valeur panier")}</dt><dd>{formatMoney(selectedSession.estimated_cart_value, selectedSession.currency_code || selectedShop?.currency_code, language)}</dd></div>
                    <div><dt>{ui("Action state", "État de l’action")}</dt><dd>{publicEnumLabel(selectedSession.action_status?.delivery_state || selectedSession.action_status?.state, language)}</dd></div>
                    <div><dt>{ui("Outcome", "Résultat")}</dt><dd>{publicEnumLabel(selectedSession.outcome?.status, language, ui("In progress", "En cours"))}</dd></div>
                    <div><dt>{ui("Priority score", "Score de priorité")}</dt><dd>{selectedSession.priority?.score ?? "—"}</dd></div>
                  </dl>
                  {(selectedSession.priority?.reasons || []).length ? <div className="journey-reasons"><strong>{ui("Why it matters", "Pourquoi agir")}</strong><ul>{selectedSession.priority?.reasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
                </aside>
              ) : null}
            </div>
          ) : <div className="operational-state"><p className="eyebrow">{ui("Waiting for signals", "En attente de signaux")}</p><h2>{ui("No journey matches this view yet", "Aucun parcours ne correspond encore à cette vue")}</h2><p>{ui("The connector will populate this audit automatically as customers browse the store.", "Le connecteur alimentera automatiquement cet audit pendant la navigation des clients.")}</p></div>}

          {payload.recent_audits.length ? <section className="journey-audits"><div><p className="eyebrow">{ui("Recent audits", "Audits récents")}</p><h2>{ui("Revenue leaks and recommended actions", "Fuites de revenu et actions recommandées")}</h2></div>{payload.recent_audits.map((audit) => <article key={audit.id}><span className="status-pill">{publicEnumLabel(audit.status, language, ui("Ready", "Prêt"))}</span><div><strong>{audit.journey_summary?.summary_text || publicEnumLabel(audit.journey_summary?.lifecycle_state, language, ui("Journey snapshot", "Résumé du parcours"))}</strong><small>{formatDate(audit.created_at, language)}</small></div><div><strong>{audit.revenue_leaks?.[0]?.summary || ui("No critical leak detected", "Aucune fuite critique détectée")}</strong><small>{audit.recommended_actions?.[0]?.next_step || audit.recommended_actions?.[0]?.label || ui("Continue monitoring", "Poursuivre la surveillance")}</small></div></article>)}</section> : null}

          <p className="journey-privacy">{ui("Raw names, emails, tokens, cookies and session IDs are not exposed in Community. Masked identifiers are used only to help the merchant investigate a journey.", "Les noms, emails bruts, jetons, cookies et identifiants de session ne sont pas exposés dans Community. Les identifiants masqués servent uniquement à aider le marchand à examiner un parcours.")}</p>
        </>
      ) : null}
    </section>
  );
}
