"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { publicErrorMessage } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";

type MemberMessage = {
  id: string;
  title: string;
  preview: string;
  body: string;
  createdAt?: string | null;
  unread: boolean;
  kind?: string | null;
  badge?: string | null;
  shop_id?: string | null;
  upgrade_href?: string | null;
  localOnly?: boolean;
};

const WELCOME_MESSAGE_ID = "welcome-cockpit-2026-10";
const LOCAL_READ_STORAGE_KEY = "nc_member_messages_read_ids";

function welcomeMessage(language: UiLanguage): MemberMessage {
  if (language === "fr") {
    return {
      id: WELCOME_MESSAGE_ID,
      title: "Bienvenue dans votre cockpit NeuroCheckout",
      preview: "Votre espace membre est prêt. Suivez vos KPI et les signaux de vos agents autonomes.",
      body: "Bienvenue dans votre cockpit NeuroCheckout.\n\nVotre environnement est prêt : les agents actifs de votre offre s’activent automatiquement et fonctionnent de manière autonome. Commencez par la vue d’ensemble, puis consultez les performances et l’audit du parcours pour identifier les actions à forte valeur.\n\nConseil : utilisez les messages internes pour suivre les informations opérationnelles qui demandent votre attention.",
      createdAt: "2026-10-11T08:00:00Z",
      unread: true,
      badge: "NeuroCheckout",
      localOnly: true,
    };
  }
  return {
    id: WELCOME_MESSAGE_ID,
    title: "Welcome to your NeuroCheckout cockpit",
    preview: "Your member space is ready. Track KPIs and signals from your autonomous agents.",
    body: "Welcome to your NeuroCheckout cockpit.\n\nYour environment is ready: the active agents in your plan activate automatically and operate autonomously. Start from Overview, then review performance and the journey audit to identify high-value actions.\n\nTip: use Internal messages to follow operational information that needs your attention.",
    createdAt: "2026-10-11T08:00:00Z",
    unread: true,
    badge: "NeuroCheckout",
    localOnly: true,
  };
}

function localReadIds(): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_READ_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item)) : []);
  } catch {
    return new Set();
  }
}

function markLocalRead(id: string): void {
  const ids = localReadIds();
  ids.add(id);
  try {
    window.localStorage.setItem(LOCAL_READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // The visual read state still updates when browser storage is unavailable.
  }
}

export default function MemberMessages({ language }: { language: UiLanguage }) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [items, setItems] = useState<MemberMessage[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/cloud/notifications?locale=${language}&limit=100`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(ui(
            "Reconnect this installation once to grant member message access.",
            "Reconnectez cette installation une fois pour autoriser les messages membre.",
          ));
        }
        const detail = typeof payload?.detail === "string" ? payload.detail : "";
        if (detail === "cloud_response_invalid") {
          throw new Error(ui(
            "The Cloud message service returned an invalid response. Please retry in a moment.",
            "Le service de messages Cloud a renvoyé une réponse invalide. Réessayez dans un instant.",
          ));
        }
        throw new Error(publicErrorMessage(
          detail,
          { en: "Unable to load messages.", fr: "Impossible de charger les messages." },
          language,
        ));
      }
      const dynamicItems = Array.isArray(payload?.items) ? payload.items as MemberMessage[] : [];
      const readIds = localReadIds();
      const builtIn = { ...welcomeMessage(language), unread: !readIds.has(WELCOME_MESSAGE_ID) };
      const nextItems = [builtIn, ...dynamicItems.filter((item) => item.id !== builtIn.id)]
        .sort((left, right) => {
          const leftTime = Date.parse(String(left.createdAt || ""));
          const rightTime = Date.parse(String(right.createdAt || ""));
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        });
      setItems(nextItems);
      setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || "");
    } catch (loadError) {
      setItems([]);
      setSelectedId("");
      setError(loadError instanceof Error ? loadError.message : ui("Unable to load messages.", "Impossible de charger les messages."));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  const unreadCount = items.filter((item) => item.unread).length;

  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(language === "fr" ? "fr-FR" : "en-US");
  };

  const openMessage = async (item: MemberMessage) => {
    setSelectedId(item.id);
    if (!item.unread) return;
    setError("");
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: false } : candidate));
    if (item.localOnly) {
      markLocalRead(item.id);
      return;
    }
    try {
      const response = await fetch(`/api/cloud/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(publicErrorMessage(
          payload?.detail,
          { en: "Unable to mark this message as read.", fr: "Impossible de marquer ce message comme lu." },
          language,
        ));
      }
      if (payload?.id === item.id) {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...payload, unread: false } : candidate));
      }
    } catch (readError) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: true } : candidate));
      setError(readError instanceof Error ? readError.message : ui("Unable to mark this message as read.", "Impossible de marquer ce message comme lu."));
    }
  };

  return (
    <section className="view-enter operational-view messages-view">
      <div className="operational-toolbar">
        <span>{unreadCount} {ui("unread", "non lu(s)")} · {items.length} {ui("messages retained", "messages conservés")}</span>
        <button className="text-action" type="button" onClick={() => void load()}>{ui("Refresh", "Actualiser")}</button>
      </div>

      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {loading ? (
        <div className="operational-state"><span className="loader" /><p>{ui("Loading your messages…", "Chargement de vos messages…")}</p></div>
      ) : error && items.length === 0 ? null : items.length === 0 ? (
        <div className="operational-state">
          <p className="eyebrow">{ui("No alert", "Aucune alerte")}</p>
          <h2>{ui("Your message center is clear", "Votre centre de messages est vide")}</h2>
          <p>{ui("Quota, account and service notices will appear here when action is useful.", "Les notifications de quota, de compte et de service apparaîtront ici lorsqu’une action sera utile.")}</p>
        </div>
      ) : (
        <div className="message-workspace">
          <div className="message-list" aria-label={ui("Member messages", "Messages membre")}>
            {items.map((item) => (
              <button className={selected?.id === item.id ? "active" : ""} key={item.id} type="button" onClick={() => void openMessage(item)}>
                <span className="message-title"><i className={item.unread ? "unread" : ""} /><strong>{item.title}</strong></span>
                <span>{item.preview}</span>
                <time>{formatDate(item.createdAt)}</time>
              </button>
            ))}
          </div>

          {selected ? (
            <article className="message-detail">
              <header><div><p className="eyebrow">{selected.badge || ui("NeuroCheckout notice", "Notification NeuroCheckout")}</p><h2>{selected.title}</h2></div>{selected.shop_id ? <span className="status-pill">{selected.shop_id}</span> : null}</header>
              <time>{formatDate(selected.createdAt)}</time>
              <div className="message-body">{selected.body}</div>
              {selected.upgrade_href ? <a className="button secondary-blue" href="/api/upgrade" target="_blank" rel="noreferrer">{ui("View account options", "Voir les options du compte")}</a> : null}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
