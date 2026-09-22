"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { publicErrorMessage } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";

type Shop = { id?: string; shop_uuid?: string; canonical_shop_id?: string; shop_id: string; platform?: string };
type Connector = {
  shop_id: string;
  platform: string;
  installed_version: string;
  latest_version: string;
  status: string;
  last_seen_at: string;
};
type CloudHealth = {
  state: "healthy" | "synchronizing" | "recovering" | "attention" | "offline";
  online: boolean;
  dashboard_version?: string | null;
  last_heartbeat_at?: string | null;
  last_signal_received_at?: string | null;
  last_signal_processed_at?: string | null;
  oldest_pending_at?: string | null;
  queue: { pending: number; processing: number; retrying: number; failed: number };
  data_quality: { incomplete: number };
  evidence: { received: number; sent: number; converted: number };
  latest_issue?: string | null;
};
type LocalHealth = {
  available: boolean;
  configured: boolean;
  ready: boolean;
  shop_id?: string;
  source?: { last_success_at?: number | null; last_complete_at?: number | null; records: number; carts: number; products: number };
  outbox?: { pending: number; oldest_at?: number | null; newest_at?: number | null };
  archive?: { confirmed: number; last_sent_at?: number | null; encrypted: boolean };
};

function shopUuid(shop: Shop): string {
  return String(shop.shop_uuid || shop.id || shop.canonical_shop_id || "").trim();
}

export default function SynchronizationHealth({ language, connectors }: { language: UiLanguage; connectors: Connector[] }) {
  const fr = language === "fr";
  const ui = (english: string, french: string) => fr ? french : english;
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [cloud, setCloud] = useState<CloudHealth | null>(null);
  const [local, setLocal] = useState<LocalHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedShop = shops.find((shop) => shopUuid(shop) === selectedShopUuid);
  const connector = connectors.find((item) => item.shop_id === selectedShop?.shop_id);

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

  const loadHealth = useCallback(async (quiet = false) => {
    if (!selectedShopUuid) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [cloudResponse, localResponse] = await Promise.all([
        fetch(`/api/cloud/sync-health?${new URLSearchParams({ shop_uuid: selectedShopUuid })}`, { cache: "no-store" }),
        fetch("/api/local-data/sync-health", { cache: "no-store" }),
      ]);
      const [cloudBody, localBody] = await Promise.all([
        cloudResponse.json().catch(() => ({})),
        localResponse.json().catch(() => ({})),
      ]);
      if (!cloudResponse.ok) throw new Error(publicErrorMessage(
        cloudBody?.detail,
        { en: "Synchronization status unavailable.", fr: "État de synchronisation indisponible." },
        language,
      ));
      setCloud(cloudBody as CloudHealth);
      setLocal(localBody as LocalHealth);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : ui("Synchronization status unavailable.", "État de synchronisation indisponible."));
    } finally {
      setLoading(false);
    }
  }, [language, selectedShopUuid]);

  useEffect(() => { void loadShops().catch((loadError) => { setError(loadError instanceof Error ? loadError.message : "Unavailable"); setLoading(false); }); }, [loadShops]);
  useEffect(() => {
    if (!selectedShopUuid) return;
    void loadHealth();
    const interval = setInterval(() => void loadHealth(true), 15_000);
    return () => clearInterval(interval);
  }, [loadHealth, selectedShopUuid]);

  const retry = async () => {
    setRetrying(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/local-data/sync-health", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(publicErrorMessage(
        body?.detail,
        { en: "Synchronization could not be restarted.", fr: "La synchronisation n’a pas pu être relancée." },
        language,
      ));
      setNotice(ui("Reconciliation scheduled. Pending events remain protected until acknowledged.", "Réconciliation programmée. Les événements en attente restent protégés jusqu’à leur accusé de réception."));
      setTimeout(() => void loadHealth(true), 2500);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : ui("Synchronization could not be restarted.", "La synchronisation n’a pas pu être relancée."));
    } finally { setRetrying(false); }
  };

  const date = (value?: string | number | null) => {
    if (!value) return "—";
    const parsed = typeof value === "number" ? new Date(value) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(fr ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "medium" });
  };
  const stateCopy = useMemo(() => ({
    healthy: ui("Healthy", "Saine"),
    synchronizing: ui("Synchronizing", "Synchronisation en cours"),
    recovering: ui("Automatic recovery", "Reprise automatique"),
    attention: ui("Attention required", "Vérification requise"),
    offline: ui("Community offline", "Community hors ligne"),
  }), [language]);
  const issueCopy: Record<string, string> = {
    community_unavailable: ui("Community was temporarily unreachable; retry is automatic.", "Community était temporairement indisponible ; la reprise est automatique."),
    consumer_failed: ui("Cloud processing is being retried automatically.", "Le traitement Cloud est relancé automatiquement."),
    worker_recovered: ui("An interrupted operation resumed without losing data.", "Une opération interrompue a repris sans perte de données."),
    cart_amount_missing: ui("A cart arrived without a usable amount.", "Un panier est arrivé sans montant exploitable."),
    record_invalid: ui("A connector record requires review.", "Une donnée du connecteur doit être vérifiée."),
  };
  const localMatches = Boolean(local?.shop_id && local.shop_id === selectedShop?.shop_id);
  const localReady = Boolean(localMatches && local?.configured && local?.ready);
  const queueHealthy = Boolean(cloud && cloud.queue.failed === 0 && cloud.data_quality.incomplete === 0);
  const status = cloud?.state || "offline";

  return <section className="view-enter sync-health-view">
    <div className="analytics-toolbar">
      <div className="analytics-filters">
        <label>{ui("Store", "Boutique")}<select value={selectedShopUuid} onChange={(event) => setSelectedShopUuid(event.target.value)}>{shops.map((shop) => <option key={shopUuid(shop)} value={shopUuid(shop)}>{shop.shop_id} · {shop.platform || "store"}</option>)}</select></label>
      </div>
      <div className="sync-actions"><span>{ui("Automatic refresh · 15 s", "Actualisation automatique · 15 s")}</span><button className="button secondary-blue" type="button" disabled={retrying || !local?.available} onClick={() => void retry()}>{retrying ? ui("Scheduling…", "Programmation…") : ui("Retry synchronization", "Relancer la synchronisation")}</button></div>
    </div>

    {error ? <p className="config-error" role="alert">{error}</p> : null}
    {notice ? <p className="config-notice" role="status">{notice}</p> : null}
    {loading ? <div className="operational-state"><span className="loader" /><p>{ui("Checking the full synchronization path…", "Vérification du parcours de synchronisation…")}</p></div> : null}

    {!loading && cloud ? <>
      <header className={`sync-health-summary ${status}`}>
        <div><p className="eyebrow">{ui("Current state", "État actuel")}</p><h2>{stateCopy[status]}</h2><p>{cloud.online ? ui("Community and Cloud are exchanging authenticated signals.", "Community et le Cloud échangent des signaux authentifiés.") : ui("Cloud is preserving pending work until Community returns.", "Le Cloud conserve le travail en attente jusqu’au retour de Community.")}</p></div>
        <div className="sync-health-score"><strong>{cloud.queue.failed + cloud.data_quality.incomplete}</strong><span>{ui("issues requiring review", "anomalies à vérifier")}</span></div>
      </header>

      <div className="sync-path" aria-label={ui("Synchronization path", "Parcours de synchronisation")}>
        <article className={connector?.status === "current" ? "ok" : "warn"}><span>01</span><div><strong>{ui("Store connector", "Connecteur boutique")}</strong><small>{connector ? `${connector.platform} · ${connector.installed_version}` : ui("Waiting for connector", "Connecteur en attente")}</small></div><i /></article>
        <article className={localReady ? "ok" : "warn"}><span>02</span><div><strong>{ui("Encrypted local vault", "Coffre local chiffré")}</strong><small>{localReady ? ui("Source synchronized", "Source synchronisée") : ui("Source catching up", "Mise à niveau de la source")}</small></div><i /></article>
        <article className={cloud.online && queueHealthy ? "ok" : "warn"}><span>03</span><div><strong>{ui("Cloud reconciliation", "Réconciliation Cloud")}</strong><small>{cloud.queue.pending} {ui("pending", "en attente")} · {cloud.queue.retrying} {ui("retrying", "en reprise")}</small></div><i /></article>
        <article className={cloud.evidence.converted > 0 ? "ok" : "neutral"}><span>04</span><div><strong>{ui("Delivery evidence", "Preuves de traitement")}</strong><small>{cloud.evidence.sent} {ui("sent", "envoyés")} · {cloud.evidence.converted} {ui("converted", "convertis")}</small></div><i /></article>
      </div>

      <div className="sync-evidence-grid">
        <section><p className="eyebrow">{ui("Freshness", "Fraîcheur")}</p><dl><div><dt>{ui("Connector pull completed", "Lecture connecteur terminée")}</dt><dd>{date(local?.source?.last_complete_at)}</dd></div><div><dt>{ui("Last signal received", "Dernier signal reçu")}</dt><dd>{date(cloud.last_signal_received_at)}</dd></div><div><dt>{ui("Last signal processed", "Dernier signal traité")}</dt><dd>{date(cloud.last_signal_processed_at)}</dd></div><div><dt>{ui("Community heartbeat", "Signal de présence Community")}</dt><dd>{date(cloud.last_heartbeat_at)}</dd></div></dl></section>
        <section><p className="eyebrow">{ui("Protected queues", "Files protégées")}</p><dl><div><dt>{ui("Local events awaiting acknowledgement", "Événements locaux en attente d’accusé")}</dt><dd>{local?.outbox?.pending ?? "—"}</dd></div><div><dt>{ui("Cloud events awaiting processing", "Événements Cloud en attente")}</dt><dd>{cloud.queue.pending}</dd></div><div><dt>{ui("Currently processing", "En cours de traitement")}</dt><dd>{cloud.queue.processing}</dd></div><div><dt>{ui("Encrypted email copies", "Copies d’emails chiffrées")}</dt><dd>{local?.archive?.confirmed ?? "—"}</dd></div></dl></section>
        <section><p className="eyebrow">{ui("Data quality", "Qualité des données")}</p><dl><div><dt>{ui("Signals received", "Signaux reçus")}</dt><dd>{cloud.evidence.received}</dd></div><div><dt>{ui("Incomplete records", "Données incomplètes")}</dt><dd>{cloud.data_quality.incomplete}</dd></div><div><dt>{ui("Failed after validation", "Échecs après validation")}</dt><dd>{cloud.queue.failed}</dd></div><div><dt>{ui("Dashboard version", "Version du tableau de bord")}</dt><dd>{cloud.dashboard_version || "—"}</dd></div></dl></section>
      </div>

      {cloud.latest_issue ? <aside className="sync-issue" role="status"><strong>{ui("Latest diagnostic", "Dernier diagnostic")}</strong><p>{issueCopy[cloud.latest_issue] || ui("A recoverable synchronization issue was detected.", "Une anomalie de synchronisation récupérable a été détectée.")}</p></aside> : null}
    </> : null}
  </section>;
}
