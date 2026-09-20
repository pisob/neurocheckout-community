"use client";
import { useEffect, useRef, useState } from "react";
import { sentEmailPreview, sentEmailRecoveryLink } from "@/lib/sent-email-preview";
import type { UiLanguage } from "@/lib/ui-language";

export type SentEmail = {
  delivery_id?: string; subject?: string | null; sent_at?: string | null;
  recipient_email?: string; customer: { email_masked?: string | null };
  agent_name?: string | null; status?: string | null; body_html?: string; body_text?: string;
  opened_at?: string | null; clicked_at?: string | null; converted_at?: string | null;
  tracking_available?: boolean; preview_available?: boolean;
  preview_asset_base_url?: string;
};
function emailKey(item: SentEmail): string {
  return item.delivery_id || [item.sent_at, item.subject, item.recipient_email || item.customer.email_masked].join("|");
}
export default function SentEmailPreview({ items, language }: { items: SentEmail[]; language: UiLanguage }) {
  const fr = language === "fr", ui = (en: string, french: string) => fr ? french : en;
  const [selectedKey, setSelectedKey] = useState(""), [documentHtml, setDocumentHtml] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<{ href: string; label: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const selected = items.find((item) => emailKey(item) === selectedKey) || items[0];
  useEffect(() => {
    if (!items.some((item) => emailKey(item) === selectedKey)) setSelectedKey(items[0] ? emailKey(items[0]) : "");
  }, [items, selectedKey]);
  useEffect(() => { setDocumentHtml(selected?.body_html && selected.preview_available ? sentEmailPreview(selected.body_html, selected.preview_asset_base_url) : ""); }, [selected]);
  useEffect(() => { setRecoveryLink(selected?.body_html && selected.preview_available ? sentEmailRecoveryLink(selected.body_html) : null); }, [selected]);
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(fr ? "fr-FR" : "en-US") : "—";
  const statuses: Record<string, string> = { sent: ui("Sent", "Envoyé"), delivered: ui("Delivered", "Livré"), opened: ui("Opened", "Ouvert"), clicked: ui("Clicked", "Cliqué"), converted: ui("Converted", "Converti"), bounced: ui("Bounced", "Rejeté") };
  const preview = (large = false) => documentHtml ? <iframe className={large ? "sent-preview-frame expanded" : "sent-preview-frame"} sandbox="" referrerPolicy="no-referrer" title={ui("Sent email preview", "Aperçu de l’email envoyé")} srcDoc={documentHtml} /> : selected?.preview_available && selected.body_text ? <pre className="sent-preview-text">{selected.body_text}</pre> : <p className="email-activity-state">{ui("The original content was not archived. No preview can be reconstructed.", "Le contenu original n’a pas été archivé. Aucun aperçu ne peut être reconstitué.")}</p>;
  if (!selected) return null;
  return <div className="sent-email-workspace">
    <div className="sent-email-list" aria-label={ui("Sent emails", "Emails envoyés")}>
      {items.slice(0,10).map((item) => <button type="button" className={emailKey(item)===emailKey(selected) ? "active" : ""} aria-pressed={emailKey(item)===emailKey(selected)} key={emailKey(item)} onClick={() => { setSelectedKey(emailKey(item)); dialog.current?.close(); }}>
        <strong>{item.subject || ui("Subject unavailable", "Objet indisponible")}</strong>
        <span>{item.recipient_email || item.customer.email_masked || ui("Protected recipient", "Destinataire protégé")}</span>
        <small>{date(item.sent_at)} · {statuses[item.status || "sent"] || "—"}</small>
      </button>)}
    </div>
    <section className="sent-email-inspector" aria-label={ui("Selected email", "Email sélectionné")}>
      <header><h3>{selected.subject || ui("Email details", "Détails de l’email")}</h3>{selected.preview_available ? <button ref={trigger} className="button secondary-blue" type="button" onClick={() => dialog.current?.showModal()}>{ui("Full preview", "Aperçu complet")}</button> : null}</header>
      <dl>
        <div><dt>{ui("To", "À")}</dt><dd>{selected.recipient_email || selected.customer.email_masked || "—"}</dd></div>
        <div><dt>{ui("Sent", "Envoyé le")}</dt><dd>{date(selected.sent_at)}</dd></div>
        <div><dt>Agent</dt><dd>{selected.agent_name === "abandoned_cart" ? "A-C-R" : selected.agent_name?.replaceAll("_", " ") || "—"}</dd></div>
        <div><dt>{ui("Status", "Statut")}</dt><dd>{statuses[selected.status || "sent"] || "—"}</dd></div>
        <div><dt>{ui("Opened", "Ouvert le")}</dt><dd>{date(selected.opened_at)}</dd></div>
        <div><dt>{ui("Clicked", "Cliqué le")}</dt><dd>{date(selected.clicked_at)}</dd></div>
        <div><dt>Conversion</dt><dd>{date(selected.converted_at)}</dd></div>
      </dl>
      {selected.tracking_available === false ? <p className="sent-preview-note">{ui("Open, click and conversion tracking is not available for this delivery path.", "Le suivi des ouvertures, clics et conversions n’est pas disponible pour ce circuit d’envoi.")}</p> : null}
      <p className="sent-preview-note">{ui("Product images are displayed. Tracking pixels and links are disabled in this preview.", "Les images des produits sont affichées. Les pixels de suivi et les liens sont désactivés dans cet aperçu.")}</p>
      {recoveryLink ? <p className="sent-preview-note"><a className="button secondary-blue" href={recoveryLink.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ui("Open original cart link", "Ouvrir le lien original du panier")}</a><br />{ui("Opens the sent email’s cart link in a new tab. This action may count as an email click.", "Ouvre le lien du mail envoyé dans un nouvel onglet. Cette action peut être comptabilisée comme un clic sur l’email.")}</p> : null}
      {preview()}
    </section>
    <dialog ref={dialog} className="sent-preview-dialog" aria-label={ui("Full email preview", "Aperçu complet de l’email")} onClose={() => trigger.current?.focus()}>
      <header><h3>{selected.subject || ui("Email preview", "Aperçu email")}</h3><button type="button" autoFocus className="button secondary-blue" onClick={() => dialog.current?.close()}>{ui("Close", "Fermer")}</button></header>
      {preview(true)}
    </dialog>
  </div>;
}
