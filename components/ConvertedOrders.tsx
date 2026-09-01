"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { UiLanguage } from "@/lib/ui-language";

type Shop = { id?: string; shop_uuid?: string; canonical_shop_id?: string; shop_id: string; platform?: string; currency_code?: string | null };
type ConvertedOrder = {
  converted_at?: string | null;
  order_id?: string | null;
  cart_id?: string | null;
  order_total?: number | null;
  attribution_agent_name?: string | null;
  influence_agent_names: string[];
  agent_value_distribution: Array<{ agent_name: string; role: string; value: number }>;
  customer: { display_name?: string | null; email_masked?: string | null };
};
type ConvertedPayload = { shop: Shop; count: number; items: ConvertedOrder[]; detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeConvertedPayload(value: unknown): ConvertedPayload | null {
  if (!isRecord(value) || !isRecord(value.shop) || !Array.isArray(value.items)) return null;
  const items = value.items
    .filter(isRecord)
    .map((item) => ({
      ...item,
      influence_agent_names: Array.isArray(item.influence_agent_names) ? item.influence_agent_names.map(String) : [],
      agent_value_distribution: Array.isArray(item.agent_value_distribution) ? item.agent_value_distribution : [],
      customer: isRecord(item.customer) ? item.customer : {},
    })) as ConvertedOrder[];
  return {
    ...(value as Omit<ConvertedPayload, "items" | "count">),
    count: typeof value.count === "number" ? value.count : items.length,
    items,
  };
}

const AGENT_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: { abandoned_cart: "Abandoned cart recovery", contextual_product_recommendation: "Personalized recommendations", intelligent_email_marketing: "Email orchestration", customer_preference_proactive: "Proactive product advisor", upsell_cross_sell_dynamic: "Upsell and cross-sell" },
  fr: { abandoned_cart: "Relance panier abandonné", contextual_product_recommendation: "Recommandations personnalisées", intelligent_email_marketing: "Orchestration email", customer_preference_proactive: "Conseiller produit proactif", upsell_cross_sell_dynamic: "Upsell et cross-sell" },
};

function shopUuid(shop: Shop): string { return String(shop.shop_uuid || shop.id || shop.canonical_shop_id || "").trim(); }
function readable(value?: string | null): string { return String(value || "").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const code = String(currency || "").toUpperCase();
  return /^[A-Z]{3}$/.test(code)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(value))
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function ConvertedOrders({ language }: { language: UiLanguage }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [limit, setLimit] = useState(30);
  const [payload, setPayload] = useState<ConvertedPayload | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
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

  const loadOrders = useCallback(async () => {
    if (!selectedShopUuid) { setPayload(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ shop_uuid: selectedShopUuid, limit: String(limit) });
      const response = await fetch(`/api/cloud/converted-orders?${query.toString()}`, { cache: "no-store" });
      const rawBody: unknown = await response.json().catch(() => ({}));
      const body = normalizeConvertedPayload(rawBody);
      if (!response.ok) {
        if (response.status === 403) throw new Error(ui("Reconnect this installation once to grant analytics access.", "Reconnectez cette installation une fois pour autoriser les statistiques."));
        const detail = isRecord(rawBody) ? String(rawBody.detail || "") : "";
        throw new Error(detail === "cloud_response_invalid"
          ? ui("Cloud access is not yet open for this analytics route.", "L’accès Cloud n’est pas encore ouvert pour cette route statistique.")
          : String(detail || ui("Converted orders unavailable.", "Commandes converties indisponibles.")));
      }
      if (!body) throw new Error(ui("Cloud returned an invalid converted-order response.", "Le Cloud a renvoyé une réponse de commandes converties invalide."));
      setPayload(body);
      setSelectedIndex(0);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : ui("Converted orders unavailable.", "Commandes converties indisponibles."));
    } finally { setLoading(false); }
  }, [language, limit, selectedShopUuid]);

  useEffect(() => { void loadShops().catch((loadError) => { setError(loadError instanceof Error ? loadError.message : ui("Stores unavailable.", "Boutiques indisponibles.")); setLoading(false); }); }, [loadShops]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const selected = payload?.items[selectedIndex] || null;
  const totalValue = useMemo(() => (payload?.items || []).reduce((sum, item) => sum + Number(item.order_total || 0), 0), [payload]);
  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(language === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  };
  const currency = payload?.shop.currency_code;

  return (
    <section className="view-enter analytics-view converted-view">
      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <label>{ui("Store", "Boutique")}<select value={selectedShopUuid} onChange={(event) => setSelectedShopUuid(event.target.value)}>{shops.map((shop) => <option key={shopUuid(shop)} value={shopUuid(shop)}>{shop.shop_id} · {shop.platform || "store"}</option>)}</select></label>
          <label>{ui("History", "Historique")}<select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value={15}>{ui("Latest 15", "15 dernières")}</option><option value={30}>{ui("Latest 30", "30 dernières")}</option><option value={60}>{ui("Latest 60", "60 dernières")}</option></select></label>
        </div>
        <button className="text-action" type="button" onClick={() => void loadOrders()}>{ui("Refresh", "Actualiser")}</button>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {loading ? <div className="operational-state"><span className="loader" /><p>{ui("Loading conversion evidence…", "Chargement des preuves de conversion…")}</p></div> : null}
      {!loading && shops.length === 0 ? <div className="operational-state"><p className="eyebrow">{ui("Store required", "Boutique requise")}</p><h2>{ui("Connect a store to see converted orders", "Connectez une boutique pour voir les commandes converties")}</h2></div> : null}

      {!loading && payload ? (
        payload.items.length === 0 ? (
          <div className="operational-state"><p className="eyebrow">{ui("No conversion yet", "Aucune conversion")}</p><h2>{ui("Converted orders will appear here", "Les commandes converties apparaîtront ici")}</h2><p>{ui("Only orders attributed by NeuroCheckout Cloud are listed.", "Seules les commandes attribuées par NeuroCheckout Cloud sont listées.")}</p></div>
        ) : (
          <>
            <div className="conversion-summary"><div><span>{ui("Orders shown", "Commandes affichées")}</span><strong>{payload.count}</strong></div><div><span>{ui("Value shown", "Valeur affichée")}</span><strong>{formatMoney(totalValue, currency)}</strong></div><p>{ui("Customer contact data is minimized before leaving Cloud.", "Les coordonnées client sont minimisées avant de quitter le Cloud.")}</p></div>
            <div className="analytics-split conversions-split">
              <div className="conversion-list">
                <div className="analytics-list-head"><span>{ui("Order", "Commande")}</span><span>{ui("Customer", "Client")}</span><span>{ui("Value", "Valeur")}</span></div>
                {payload.items.map((item, index) => (
                  <button className={selectedIndex === index ? "active" : ""} key={`${item.order_id || item.cart_id || "conversion"}-${index}`} type="button" onClick={() => setSelectedIndex(index)}>
                    <span className="analytics-index">{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{item.order_id || ui("Order without reference", "Commande sans référence")}</strong><small>{formatDate(item.converted_at)}</small></span>
                    <span><strong>{ui("Protected customer", "Client protégé")}</strong><small>{item.customer.email_masked || ui("Protected", "Protégé")}</small></span>
                    <span><strong>{formatMoney(item.order_total, currency)}</strong><small>{AGENT_LABELS[language][String(item.attribution_agent_name || "")] || readable(item.attribution_agent_name)}</small></span>
                  </button>
                ))}
              </div>

              {selected ? (
                <aside className="analytics-inspector conversion-inspector">
                  <p className="eyebrow">{ui("Conversion evidence", "Preuve de conversion")}</p>
                  <h2>{selected.order_id || ui("Attributed order", "Commande attribuée")}</h2>
                  <time>{formatDate(selected.converted_at)}</time>
                  <strong className="conversion-value">{formatMoney(selected.order_total, currency)}</strong>
                  <dl>
                    <div><dt>{ui("Customer", "Client")}</dt><dd>{ui("Protected customer", "Client protégé")}<small>{selected.customer.email_masked || ui("Contact protected", "Contact protégé")}</small></dd></div>
                    <div><dt>{ui("Cart reference", "Référence panier")}</dt><dd>{selected.cart_id || "—"}</dd></div>
                    <div><dt>{ui("Primary attribution", "Attribution principale")}</dt><dd>{AGENT_LABELS[language][String(selected.attribution_agent_name || "")] || readable(selected.attribution_agent_name) || "—"}</dd></div>
                  </dl>
                  {selected.influence_agent_names.length > 0 ? <div className="influence-list"><span>{ui("Contributing agents", "Agents contributeurs")}</span>{selected.influence_agent_names.map((agent) => <i key={agent}>{AGENT_LABELS[language][agent] || readable(agent)}</i>)}</div> : null}
                </aside>
              ) : null}
            </div>
          </>
        )
      ) : null}
    </section>
  );
}
