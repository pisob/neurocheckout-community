"use client";
import { useEffect, useRef, useState } from "react";
import { sentEmailPreview, sentEmailRecoveryLink } from "@/lib/sent-email-preview";
import { publicAgentLabel } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";

export type SentEmail = {
  delivery_id?: string; subject?: string | null; sent_at?: string | null;
  recipient_email?: string; customer: { email_masked?: string | null };
  agent_name?: string | null; status?: string | null; body_html?: string; body_text?: string;
  opened_at?: string | null; clicked_at?: string | null; converted_at?: string | null;
  tracking_available?: boolean; preview_available?: boolean;
  preview_asset_base_url?: string;
  copy_diagnostic?: { source?: string; language?: string | null; variant_id?: number | null };
  preview_state?: "available" | "unavailable" | "read_error";
  order_id?: string | null; cart_id?: string | null;
  attributed_orders?: Array<{ order_id: string; cart_id?: string | null; order_total?: number | null }>;
};
function emailKey(item: SentEmail): string {
  return item.delivery_id || [item.sent_at, item.subject, item.recipient_email || item.customer.email_masked].join("|");
}
export default function SentEmailPreview({ items, language, currency }: { items: SentEmail[]; language: UiLanguage; currency?: string | null }) {
  const fr = language === "fr", ui = (en: string, french: string) => fr ? french : en;
  const [selectedKey, setSelectedKey] = useState("");
  const [prepared, setPrepared] = useState<{ email: SentEmail; html: string; link: { href: string; label: string } | null } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const selected = items.find((item) => emailKey(item) === selectedKey) || items[0];
  useEffect(() => {
    if (!items.some((item) => emailKey(item) === selectedKey)) setSelectedKey(items[0] ? emailKey(items[0]) : "");
  }, [items, selectedKey]);
  useEffect(() => {
    dialog.current?.close();
    if (!selected) { setPrepared(null); return; }
    const html = selected.body_html && selected.preview_available ? selected.body_html : "";
    setPrepared({ email: selected, html: html ? sentEmailPreview(html, selected.preview_asset_base_url) : "", link: html ? sentEmailRecoveryLink(html) : null });
  }, [selected]);
  // Never pair a previous message's HTML or cart URL with the new selection.
  const documentHtml = prepared?.email === selected ? prepared.html : "";
  const recoveryLink = prepared?.email === selected ? prepared.link : null;
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(fr ? "fr-FR" : "en-US") : "—";
  const statuses: Record<string, string> = { sent: ui("Sent", "Envoyé"), delivered: ui("Delivered", "Livré"), opened: ui("Opened", "Ouvert"), clicked: ui("Clicked", "Cliqué"), converted: ui("Converted", "Converti"), bounced: ui("Bounced", "Rejeté") };
  const preview = (large = false) => documentHtml ? <iframe key={emailKey(selected)} className={large ? "sent-preview-frame expanded" : "sent-preview-frame"} sandbox="" referrerPolicy="no-referrer" title={ui("Sent email preview", "Aperçu de l’email envoyé")} srcDoc={documentHtml} /> : selected?.preview_available && selected.body_text ? <pre className="sent-preview-text">{selected.body_text}</pre> : <p className="email-activity-state">{selected?.preview_available && selected.body_html ? ui("Loading preview…", "Chargement de l’aperçu…") : ui("The original content is unavailable in this installation. Delivery and tracking details remain available.", "Le contenu original est indisponible dans cette installation. Les informations d’envoi et de suivi restent disponibles.")}</p>;
  if (!selected) return null;
  const copySources: Record<string, string> = { byok: "BYOK", library: ui("Custom library", "Bibliothèque personnalisée"), db: ui("Database variant", "Variante DB"), standard: ui("Standard fallback", "Contenu de secours standard") };
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
        <div><dt>{ui("Email language", "Langue de l’email")}</dt><dd>{selected.copy_diagnostic?.language || ui("Not recorded", "Non enregistrée")}</dd></div>
        <div><dt>{ui("Content source", "Source du contenu")}</dt><dd>{copySources[selected.copy_diagnostic?.source || ""] || ui("Not recorded", "Non enregistrée")}{selected.copy_diagnostic?.source === "db" && selected.copy_diagnostic.variant_id ? ` · #${selected.copy_diagnostic.variant_id}` : ""}</dd></div>
        <div><dt>{ui("To", "À")}</dt><dd>{selected.recipient_email || selected.customer.email_masked || "—"}</dd></div>
        <div><dt>{ui("Sent", "Envoyé le")}</dt><dd>{date(selected.sent_at)}</dd></div>
        <div><dt>Agent</dt><dd>{selected.agent_name ? publicAgentLabel(selected.agent_name, language) : "—"}</dd></div>
        <div><dt>{ui("Status", "Statut")}</dt><dd>{statuses[selected.status || "sent"] || "—"}</dd></div>
        <div><dt>{ui("Opened", "Ouvert le")}</dt><dd>{date(selected.opened_at)}</dd></div>
        <div><dt>{ui("Clicked", "Cliqué le")}</dt><dd>{date(selected.clicked_at)}</dd></div>
        <div><dt>Conversion</dt><dd>{date(selected.converted_at)}</dd></div>
      </dl>
      {!selected.subject ? <p className="sent-preview-note">{ui("The subject is missing from the available record. This does not prove that the delivered email had no subject.", "L’objet manque dans la preuve disponible. Cela ne prouve pas que l’email reçu était sans objet.")}</p> : null}
      {selected.preview_state === "read_error" ? <p role="alert" className="config-error">{ui("The saved copy could not be read. Refresh this history and check synchronization if the problem persists. Do not resend the email to restore its preview.", "La copie enregistrée n’a pas pu être lue. Actualisez cet historique et vérifiez la synchronisation si le problème persiste. Ne renvoyez pas l’email pour restaurer son aperçu.")}</p> : null}
      {selected.status === "converted" ? selected.attributed_orders?.length ? <div className="email-order-proof"><strong>{ui("Associated orders", "Commandes associées")}</strong><ul>{selected.attributed_orders.map(order => <li key={`${order.order_id}:${order.cart_id || ""}`}>
        {ui("Order", "Commande")} {order.order_id}{order.cart_id ? ` · ${ui("Cart", "Panier")} ${order.cart_id}` : ""}
        {typeof order.order_total === "number" && Number.isFinite(order.order_total) ? ` · ${currency && /^[A-Z]{3}$/.test(currency) ? new Intl.NumberFormat(fr ? "fr-FR" : "en-US", { style: "currency", currency }).format(order.order_total) : order.order_total}` : ""}
      </li>)}</ul><p className="sent-preview-note">{ui("Matched by recorded attribution. Order totals must not be added across emails.", "Lien établi par l’attribution enregistrée. Les montants des commandes ne doivent pas être additionnés entre emails.")}</p></div> : <p className="sent-preview-note">{ui("A conversion is recorded for this email, but no exact order reference is available in the current evidence window. Do not infer an association from the recipient or date alone.", "Une conversion est enregistrée pour cet email, mais aucune référence de commande exacte n’est disponible dans la période de preuves consultée. Ne déduisez pas de lien à partir du destinataire ou de la date seuls.")}</p> : null}
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
