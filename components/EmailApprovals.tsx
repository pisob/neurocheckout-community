"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { UiLanguage } from "@/lib/ui-language";

type ApprovalStatus = "pending" | "failed" | "sent" | "rejected" | "expired";

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
};

type ApprovalFilter = "pending" | "sent" | "rejected" | "expired" | "all";

function safePreviewDocument(html: string): string {
  const csp = [
    "default-src 'none'",
    "img-src data:",
    "style-src 'unsafe-inline'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  const guard = "<style>html{color-scheme:light}a,button,input,select,textarea,form{pointer-events:none!important}</style>";
  const content = String(html || "");
  if (/<head[\s>]/i.test(content)) {
    return content.replace(
      /<head([^>]*)>/i,
      `<head$1><meta http-equiv="Content-Security-Policy" content="${csp}">${guard}`,
    );
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}">${guard}</head><body>${content}</body></html>`;
}

export default function EmailApprovals({ language }: { language: UiLanguage }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [filter, setFilter] = useState<ApprovalFilter>("pending");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ status: filter, limit: "50", offset: "0" });
      const response = await fetch(`/api/cloud/email-approvals?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(ui(
            "Reconnect this installation once to grant email approval access.",
            "Reconnectez cette installation une fois pour autoriser les validations email.",
          ));
        }
        throw new Error(String(payload?.detail || ui("Unable to load approvals.", "Impossible de charger les validations.")));
      }
      const nextItems = Array.isArray(payload?.items) ? payload.items as ApprovalItem[] : [];
      setItems(nextItems);
      setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || "");
    } catch (loadError) {
      setItems([]);
      setSelectedId("");
      setError(loadError instanceof Error ? loadError.message : ui("Unable to load approvals.", "Impossible de charger les validations."));
    } finally {
      setLoading(false);
    }
  }, [filter, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  const formatDate = (value?: string | null) => {
    if (!value) return ui("Not available", "Non disponible");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return ui("Not available", "Non disponible");
    return date.toLocaleString(language === "fr" ? "fr-FR" : "en-US");
  };

  const act = async (kind: "approve" | "reject") => {
    if (!selected || busyId) return;
    const confirmed = window.confirm(kind === "approve"
      ? ui("Approve and send this email now?", "Approuver et envoyer cet email maintenant ?")
      : ui("Reject this email? It will not be sent.", "Rejeter cet email ? Il ne sera pas envoyé."));
    if (!confirmed) return;

    setBusyId(selected.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/cloud/email-approvals/${encodeURIComponent(selected.id)}/${kind}`,
        { method: "POST", cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.detail || "email_approval_action_failed"));
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
      <div className="operational-toolbar">
        <div className="filter-tabs" role="group" aria-label={ui("Approval status", "Statut de validation")}>
          {(["pending", "sent", "rejected", "expired", "all"] as ApprovalFilter[]).map((value) => (
            <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>
              {{
                pending: ui("Pending", "En attente"),
                sent: ui("Sent", "Envoyés"),
                rejected: ui("Rejected", "Rejetés"),
                expired: ui("Expired", "Expirés"),
                all: ui("All", "Tous"),
              }[value]}
            </button>
          ))}
        </div>
        <button className="text-action" type="button" onClick={() => void load()}>{ui("Refresh", "Actualiser")}</button>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {notice ? <p className="config-notice" role="status">{notice}</p> : null}

      {loading ? (
        <div className="operational-state"><span className="loader" /><p>{ui("Loading approval queue…", "Chargement de la file de validation…")}</p></div>
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
                <span className="approval-list-heading"><strong>{item.subject}</strong><i>{item.status}</i></span>
                <small>{item.recipient_email}</small>
                <span className="approval-list-meta"><span>{item.shop_id}</span><time>{formatDate(item.created_at)}</time></span>
              </button>
            ))}
          </div>

          {selected ? (
            <article className="approval-preview">
              <header>
                <div><p className="eyebrow">{ui("Delivery preview", "Aperçu de l’envoi")}</p><h2>{selected.subject}</h2></div>
                <span className="status-pill">{selected.status}</span>
              </header>
              <dl className="approval-facts">
                <div><dt>{ui("Recipient", "Destinataire")}</dt><dd>{selected.recipient_email}</dd></div>
                <div><dt>{ui("Store", "Boutique")}</dt><dd>{selected.shop_id}</dd></div>
                <div><dt>{ui("Agent", "Agent")}</dt><dd>{selected.agent_name || "—"}</dd></div>
                <div><dt>{ui("Expires", "Expiration")}</dt><dd>{formatDate(selected.expires_at)}</dd></div>
              </dl>
              <div className="email-document">
                {selected.body_html ? (
                  <iframe sandbox="" title={ui("Sanitized email preview", "Aperçu email nettoyé")} srcDoc={safePreviewDocument(selected.body_html)} />
                ) : (
                  <pre>{selected.body_text || ui("No preview content is available.", "Aucun contenu d’aperçu n’est disponible.")}</pre>
                )}
              </div>
              {selected.last_error ? <p className="config-error">{selected.last_error}</p> : null}
              {selected.status === "pending" || selected.status === "failed" ? (
                <div className="approval-actions">
                  <button className="button primary" type="button" disabled={Boolean(busyId)} onClick={() => void act("approve")}>{ui("Approve and send", "Approuver et envoyer")}</button>
                  <button className="button danger" type="button" disabled={Boolean(busyId)} onClick={() => void act("reject")}>{ui("Reject", "Rejeter")}</button>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
