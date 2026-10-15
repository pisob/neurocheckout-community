"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publicAgentLabel, publicErrorMessage } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";
import { useEvidenceRefresh } from "@/lib/use-evidence-refresh";
import { sentEmailPreview } from "@/lib/sent-email-preview";

type ApprovalStatus = "pending" | "failed" | "sending" | "sent" | "rejected" | "expired";

type ApprovalItem = {
  id: string;
  shop_id: string;
  recipient_email: string;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  agent_name?: string | null;
  status: ApprovalStatus;
  created_at?: string | null;
  expires_at?: string | null;
  last_error?: string | null;
  shop_uuid?: string;
  content_location?: string;
  community_copy_signature?: string;
  preview_available?: boolean;
  preview_asset_base_url?: string;
};

type ApprovalFilter = "pending" | "sending" | "sent" | "rejected" | "expired" | "all";
type ApprovalShop = { shop_uuid: string; shop_id: string; platform?: string };
const PAGE_SIZE = 50;

export default function EmailApprovals({ language }: { language: UiLanguage }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [filter, setFilter] = useState<ApprovalFilter>("pending");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const requestSequence = useRef(0);
  const [shops, setShops] = useState<ApprovalShop[]>([]);
  const [shopUuid, setShopUuid] = useState("");
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState("");
  const shopSequence = useRef(0);
  const loadShops = useCallback(async () => {
    const sequence = ++shopSequence.current;
    setShopsLoading(true); setShopsError("");
    try {
      const response = await fetch("/api/cloud/shops", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.items)) throw Error("unavailable");
      const nextShops = payload.items.map((shop: Record<string, unknown>) => ({ ...shop, shop_uuid: String(shop.shop_uuid || shop.canonical_shop_id || shop.id || "") })) as ApprovalShop[];
      if (nextShops.some(shop => !/^[a-f0-9-]{36}$/i.test(shop.shop_uuid) || typeof shop.shop_id !== "string")) throw Error("invalid");
      if (sequence !== shopSequence.current) return;
      setShops(nextShops);
      setShopUuid(current => nextShops.some(shop => shop.shop_uuid === current) ? current : nextShops[0]?.shop_uuid || "");
    } catch {
      if (sequence === shopSequence.current) setShopsError(language === "fr" ? "Impossible de charger les boutiques. Réessayez." : "Unable to load stores. Please retry.");
    } finally { if (sequence === shopSequence.current) setShopsLoading(false); }
  }, [language]);
  useEffect(() => { void loadShops(); return () => { ++shopSequence.current; }; }, [loadShops]);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!shopUuid) { setLoading(false); setItems([]); setSelectedId(""); setTotal(null); return; }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ shop_uuid: shopUuid, status: filter, limit: String(PAGE_SIZE), offset: String(offset) });
      const response = await fetch(`/api/cloud/email-approvals?${query.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== requestSequence.current) return;
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(ui(
            "Reconnect this installation once to grant email approval access.",
            "Reconnectez cette installation une fois pour autoriser les validations email.",
          ));
        }
        throw new Error(publicErrorMessage(
          payload?.detail,
          { en: "Unable to load approvals.", fr: "Impossible de charger les validations." },
          language,
        ));
      }
      if (!Array.isArray(payload?.items) || !payload.items.every((item: ApprovalItem) =>
        item && typeof item.id === "string" && typeof item.shop_id === "string" &&
        typeof item.subject === "string" && typeof item.recipient_email === "string" &&
        (!item.shop_uuid || item.shop_uuid === shopUuid) &&
        ["pending", "failed", "sending", "sent", "rejected", "expired"].includes(item.status) &&
        (filter === "all" || item.status === filter || (filter === "pending" && item.status === "failed"))) ||
        (payload.total !== undefined && (!Number.isSafeInteger(payload.total) || payload.total < 0)) ||
        (payload.offset !== undefined && payload.offset !== offset)) {
        throw new Error(ui("Cloud returned an invalid approval queue. Refresh to verify.", "Le Cloud a renvoyé une file de validation invalide. Actualisez pour vérifier."));
      }
      const nextItems = payload.items as ApprovalItem[];
      const nextTotal = payload.total ?? (offset + nextItems.length);
      if (offset > 0 && nextItems.length === 0 && nextTotal <= offset) {
        setOffset(Math.max(0, Math.ceil(nextTotal / PAGE_SIZE) - 1) * PAGE_SIZE);
        return;
      }
      setTotal(nextTotal);
      setItems(nextItems);
      setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || "");
    } catch (loadError) {
      if (sequence !== requestSequence.current) return;
      setItems([]);
      setTotal(null);
      setSelectedId("");
      setError(loadError instanceof Error ? loadError.message : ui("Unable to load approvals.", "Impossible de charger les validations."));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [filter, language, offset, shopUuid]);

  useEffect(() => {
    void load();
    return () => { ++requestSequence.current; };
  }, [load]);
  useEvidenceRefresh(load, !busyId);

  const changePage = (nextOffset: number, nextFilter = filter) => {
    ++requestSequence.current;
    setLoading(true); setItems([]); setSelectedId(""); setTotal(null); setError(""); setNotice("");
    setOffset(nextOffset); setFilter(nextFilter);
  };

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );
  const localPreviewMissing = selected?.content_location === "community_local" &&
    (!selected.preview_available || !selected.community_copy_signature || selected.shop_uuid !== shopUuid);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    setPreview(selected?.body_html ? sentEmailPreview(selected.body_html, selected.preview_asset_base_url) : "");
  }, [selected]);

  const formatDate = (value?: string | null) => {
    if (!value) return ui("Not available", "Non disponible");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return ui("Not available", "Non disponible");
    return date.toLocaleString(language === "fr" ? "fr-FR" : "en-US");
  };

  const act = async (kind: "approve" | "reject") => {
    if (!selected || busyId || loading || error || shopsError || (kind === "approve" && localPreviewMissing)) return;
    const confirmed = window.confirm(kind === "approve"
      ? ui("Approve this exact email for Cloud delivery when the store is connected?", "Approuver cet email pour envoi Cloud dès que la boutique est connectée ?")
      : ui("Reject this email? It will not be sent.", "Rejeter cet email ? Il ne sera pas envoyé."));
    if (!confirmed) return;

    setBusyId(selected.id);
    ++requestSequence.current;
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/cloud/email-approvals/${encodeURIComponent(selected.id)}/${kind}?${new URLSearchParams({ shop_uuid: shopUuid })}`,
        { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "approve" && selected.content_location === "community_local" ? { copy_signature: selected.community_copy_signature } : {}) },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(publicErrorMessage(
        payload?.detail,
        { en: "The approval action could not be completed.", fr: "L’action de validation n’a pas pu être effectuée." },
        language,
      ));
      setNotice(kind === "approve"
        ? ui("Email approved and handed to Cloud delivery.", "Email approuvé et transmis à l’envoi Cloud.")
        : ui("Email rejected. No delivery was triggered.", "Email rejeté. Aucun envoi n’a été déclenché."));
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : ui("Action failed.", "Échec de l’action."));
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="view-enter operational-view approvals-view">
      <div className="analytics-filterbar">
        <label>{ui("Store", "Boutique")}<select aria-label={ui("Store", "Boutique")} value={shopUuid} disabled={Boolean(busyId) || shopsLoading} onChange={event => { changePage(0); setShopUuid(event.target.value); }}>
          {shops.map(shop => <option key={shop.shop_uuid} value={shop.shop_uuid}>{shop.shop_id} · {shop.platform || "store"}</option>)}
        </select></label>
      </div>
      <div className="operational-toolbar">
        <div className="filter-tabs" role="group" aria-label={ui("Approval status", "Statut de validation")}>
          {(["pending", "sending", "sent", "rejected", "expired", "all"] as ApprovalFilter[]).map((value) => (
            <button className={filter === value ? "active" : ""} key={value} type="button" disabled={Boolean(busyId)} onClick={() => { if (value !== filter) changePage(0, value); }}>
              {{
                pending: ui("Pending", "En attente"),
                sending: ui("Approved / sending", "Approuvés / envoi"),
                sent: ui("Sent", "Envoyés"),
                rejected: ui("Rejected", "Rejetés"),
                expired: ui("Expired", "Expirés"),
                all: ui("All", "Tous"),
              }[value]}
            </button>
          ))}
        </div>
        <button className="text-action" type="button" disabled={Boolean(busyId) || loading || shopsLoading} onClick={() => { if (shopsError || !shopUuid) void loadShops(); else void load(); }}>{ui("Refresh", "Actualiser")}</button>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {shopsError ? <p className="config-error" role="alert">{shopsError}</p> : null}
      {notice ? <p className="config-notice" role="status">{notice}</p> : null}

      {loading || shopsLoading ? (
        <div className="operational-state"><span className="loader" /><p>{ui("Loading approval queue…", "Chargement de la file de validation…")}</p></div>
      ) : error || shopsError ? null : !shopUuid ? (
        <div className="operational-state"><h2>{ui("Connect a store to review emails", "Connectez une boutique pour valider les emails")}</h2><a href="#configuration">{ui("Open configuration", "Ouvrir la configuration")}</a></div>
      ) : items.length === 0 ? (
        <div className="operational-state">
          <p className="eyebrow">{ui("Queue clear", "File vide")}</p>
          <h2>{ui("No email requires action", "Aucun email ne demande d’action")}</h2>
          <p>{ui("Emails appear here only when a store uses manual approval.", "Les emails apparaissent ici uniquement lorsqu’une boutique utilise la validation manuelle.")}</p>
        </div>
      ) : (
        <div className="approval-workspace">
          <div className="approval-list" aria-label={ui("Emails awaiting review", "Emails à vérifier")}>
            {items.map((item) => (
              <button className={selected?.id === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
                <span className="approval-list-heading"><strong>{item.subject || ui("Local preview unavailable", "Aperçu local indisponible")}</strong><i>{item.status}</i></span>
                <small>{item.recipient_email || ui("Protected recipient", "Destinataire protégé")}</small>
                <span className="approval-list-meta"><span>{item.shop_id}</span><time>{formatDate(item.created_at)}</time></span>
              </button>
            ))}
          </div>

          {selected ? (
            <article className="approval-preview">
              <header>
                <div><p className="eyebrow">{ui("Delivery preview", "Aperçu de l’envoi")}</p><h2>{selected.subject || ui("Local preview unavailable", "Aperçu local indisponible")}</h2></div>
                <span className="status-pill">{selected.status}</span>
              </header>
              <dl className="approval-facts">
                <div><dt>{ui("Recipient", "Destinataire")}</dt><dd>{selected.recipient_email}</dd></div>
                <div><dt>{ui("Store", "Boutique")}</dt><dd>{selected.shop_id}</dd></div>
                <div><dt>{ui("Agent", "Agent")}</dt><dd>{selected.agent_name ? publicAgentLabel(selected.agent_name, language) : "—"}</dd></div>
                <div><dt>{ui("Expires", "Expiration")}</dt><dd>{formatDate(selected.expires_at)}</dd></div>
              </dl>
              <div className="email-document">
                {selected.body_html ? (
                  <iframe sandbox="" title={ui("Sanitized email preview", "Aperçu email nettoyé")} srcDoc={preview} />
                ) : (
                  <pre>{selected.body_text || ui("No preview content is available.", "Aucun contenu d’aperçu n’est disponible.")}</pre>
                )}
              </div>
              {localPreviewMissing ? <p role="status">{ui("The exact original is unavailable in this installation’s encrypted vault. Approval is disabled; reconnect the original installation to review it.", "L’original exact est indisponible dans le coffre chiffré de cette installation. L’approbation est désactivée ; reconnectez l’installation d’origine pour le vérifier.")}</p> : null}
              {selected.last_error ? <p className="config-error">{ui("The last delivery attempt did not complete.", "La dernière tentative d’envoi n’a pas abouti.")}</p> : null}
              {selected.status === "pending" || selected.status === "failed" ? (
                <div className="approval-actions">
                  <button className="button primary" type="button" disabled={Boolean(busyId) || localPreviewMissing} onClick={() => void act("approve")}>{ui("Approve and send", "Approuver et envoyer")}</button>
                  <button className="button danger" type="button" disabled={Boolean(busyId)} onClick={() => void act("reject")}>{ui("Reject", "Rejeter")}</button>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
      {!error && total !== null && total > 0 ? <div className="analytics-pagination" aria-label={ui("Approval pages", "Pages de validation")}>
        <button className="text-action" disabled={loading || Boolean(busyId) || offset === 0} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>{ui("Previous", "Précédent")}</button>
        <span>{offset + 1}–{Math.min(offset + items.length, total)} / {total}</span>
        <button className="text-action" disabled={loading || Boolean(busyId) || offset + PAGE_SIZE >= total} onClick={() => changePage(offset + PAGE_SIZE)}>{ui("Next", "Suivant")}</button>
      </div> : null}
    </section>
  );
}
