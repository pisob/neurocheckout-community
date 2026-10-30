import type { UiLanguage } from "./ui-language";

type MessageActionInput = { kind?: string | null; shop_id?: string | null; upgrade_href?: string | null; upgrade_label?: string | null };

export function memberMessageAction(message: MessageActionInput, language: UiLanguage, performanceAvailable: boolean) {
  if (typeof message.upgrade_href !== "string" || !message.upgrade_href) return null;
  const ui = (en: string, fr: string) => language === "fr" ? fr : en;
  if (message.kind?.startsWith("business_alert_incident:")) {
    if (!performanceAvailable) return { href: "#overview", label: ui("Open overview", "Ouvrir la vue d’ensemble"), external: false };
    const query = new URLSearchParams({ notice_agent: "business_alerts_anomalies" });
    if (message.shop_id) query.set("notice_shop", message.shop_id);
    return { href: `?${query.toString()}#agent-performance`, label: message.upgrade_label || ui("Review business alerts", "Consulter les alertes business"), external: false };
  }
  // A message URL never authorizes an arbitrary redirect. Translate only known
  // member destinations to views or the installation's configured account route.
  if (!message.upgrade_href.startsWith("/") || message.upgrade_href.startsWith("//")) return null;
  const target = new URL(message.upgrade_href, "https://community.invalid");
  if (target.origin !== "https://community.invalid") return null;
  if (["/onboarding/subscription", "/pricing"].includes(target.pathname)) {
    return { href: "/api/upgrade", label: message.upgrade_label || ui("View account options", "Voir les options du compte"), external: true };
  }
  if (target.pathname === "/dashboard/overview") {
    return { href: "#overview", label: ui("Open overview", "Ouvrir la vue d’ensemble"), external: false };
  }
  return null;
}
