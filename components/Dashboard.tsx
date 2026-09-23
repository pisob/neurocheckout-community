"use client";

import { useEffect, useState } from "react";
import CloudConfiguration from "@/components/CloudConfiguration";
import EmailApprovals from "@/components/EmailApprovals";
import MemberMessages from "@/components/MemberMessages";
import PlanAndData from "@/components/PlanAndData";
import PartnerProgram from "@/components/PartnerProgram";
import AgentPerformance from "@/components/AgentPerformance";
import JourneyAudit from "@/components/JourneyAudit";
import SynchronizationHealth from "@/components/SynchronizationHealth";
import ConvertedOrders from "@/components/ConvertedOrders";
import LocalUpdate from "@/components/LocalUpdate";
import { agentAvatar, SUPERVISOR_AVATAR } from "@/lib/agent-visuals";
import { publicAgentLabel, publicEnumLabel, publicErrorMessage } from "@/lib/public-presentation";
import { useUiLanguage, type UiLanguage } from "@/lib/ui-language";

export type Capabilities = {
  schema_version: string;
  manifest?: {
    version: string;
    authority: "neurocheckout_cloud";
    deny_by_default: boolean;
    refresh_after_seconds: number;
  };
  interface?: {
    mode: "self_hosted_community";
    permanent_after_upgrade: boolean;
    cloud_business_logic_only: boolean;
  };
  plan: { code: string; edition: "community" | "cloud" };
  subscription: {
    status: string;
    active: boolean;
    selected_plan_code?: string | null;
    billing_cycle?: "monthly" | "annual" | null;
    trial_ends_at?: string | null;
    grace_ends_at?: string | null;
    action_required?: string;
    can_manage_billing?: boolean;
    local_data_preserved?: boolean;
  };
  limits: {
    shops: number | null;
    active_agents: number | null;
    emails: {
      limit: number | null;
      used: number | null;
      remaining: number | null;
      window: string | null;
      scope: string | null;
      next_release_at?: string | null;
      window_hours?: number | null;
    };
  };
  features: Record<string, boolean>;
  agents: {
    available: string[];
    disabled?: string[];
    specialized_count?: number;
    active_count?: number;
    coordination_enabled: boolean;
    supervisor?: {
      agent_name: string;
      display_name: string;
      role: "coordination";
      enabled: boolean;
      description: string;
    };
  };
  dashboard: {
    current_version: string | null;
    minimum_version: string;
    latest_version: string;
    update_required: boolean;
    update_recommended: boolean;
  };
  connectors: Array<{
    shop_id: string;
    platform: "prestashop" | "magento" | "woocommerce";
    installed_version: string;
    latest_version: string;
    minimum_version: string;
    status: "current" | "available" | "required" | "blocked";
    update_available: boolean;
    update_required: boolean;
    release_url: string;
    preserves_data: boolean;
    last_seen_at: string;
  }>;
  upgrade: {
    available: boolean;
    target_plans: string[];
    action?: "checkout" | "upgrade" | null;
    billing_cycles?: Array<"monthly" | "annual">;
    same_member_api: boolean;
    self_hosted_dashboard_can_continue: boolean;
    return_to_community?: boolean;
  };
  data_residency?: {
    preserved_on_plan_change: boolean;
    [key: string]: unknown;
  };
};

type DashboardView = "overview" | "agents" | "agent-performance" | "converted-orders" | "usage" | "email-approvals" | "journey-audit" | "sync-health" | "messages" | "partner-program" | "features" | "configuration";

type ViewCopy = Record<DashboardView, { label: string; eyebrow: string; title: string; description: string }>;

const VIEW_COPY: Record<UiLanguage, ViewCopy> = {
  en: {
    overview: { label: "Overview", eyebrow: "Operations center", title: "Installation status", description: "Quotas, agents and Cloud access in one control view." },
    agents: { label: "Agents", eyebrow: "Shared orchestration", title: "Available agents", description: "Active roles cooperate in the Cloud to make every decision more reliable." },
    "agent-performance": { label: "Agent performance", eyebrow: "Measured contribution", title: "Agent performance", description: "Compare attributed value, engagement and operational impact for one store and period." },
    "converted-orders": { label: "Orders & emails", eyebrow: "Customer activity evidence", title: "Orders and email activity", description: "Inspect attributed orders and the latest 10 sent emails, with locally archived previews when available." },
    usage: { label: "Usage", eyebrow: "Community capacity", title: "Quotas and usage", description: "Track your email window and the limits applied by your plan." },
    "email-approvals": { label: "Email approvals", eyebrow: "Delivery control", title: "Emails to approve", description: "Review manual-approval emails before NeuroCheckout Cloud sends them." },
    "journey-audit": { label: "Journey audit", eyebrow: "Customer journey evidence", title: "Customer journey audit", description: "Review useful journeys, likely revenue leaks and the handoffs other agents can take over." },
    "sync-health": { label: "Sync health", eyebrow: "End-to-end reliability", title: "Synchronization health", description: "Follow each event from the store connector to its Cloud processing evidence." },
    messages: { label: "Internal messages", eyebrow: "Operational guidance", title: "Internal messages", description: "Read operational updates, account notices and guidance issued for your workspace." },
    "partner-program": { label: "Partner program", eyebrow: "Partner attribution", title: "Partner program", description: "Manage your referral link, attributed customers, commissions and payout requests." },
    features: { label: "Plan & data", eyebrow: "Secure account access", title: "Plan, access and data", description: "Manage your subscription and review the safeguards applied to your data." },
    configuration: { label: "Configuration", eyebrow: "Controlled customization", title: "Store, email and connector", description: "Configure only the tool you need from a focused workspace." },
  },
  fr: {
    overview: { label: "Vue d’ensemble", eyebrow: "Centre opérationnel", title: "État de votre installation", description: "Quotas, agents et accès Cloud réunis dans une vue de contrôle." },
    agents: { label: "Agents", eyebrow: "Orchestration partagée", title: "Agents disponibles", description: "Les rôles actifs coopèrent dans le Cloud pour fiabiliser chaque décision." },
    "agent-performance": { label: "Performance des agents", eyebrow: "Contribution mesurée", title: "Performance des agents", description: "Comparez la valeur attribuée, l’engagement et l’impact opérationnel par boutique et période." },
    "converted-orders": { label: "Commandes & emails", eyebrow: "Preuves d’activité client", title: "Commandes et activité email", description: "Consultez les commandes attribuées et les 10 derniers emails envoyés, avec les aperçus archivés localement lorsqu’ils sont disponibles." },
    usage: { label: "Utilisation", eyebrow: "Capacité Community", title: "Quotas et consommation", description: "Suivez la fenêtre email et les limites appliquées par votre offre." },
    "email-approvals": { label: "Validations email", eyebrow: "Contrôle des envois", title: "Emails à approuver", description: "Vérifiez les emails en validation manuelle avant leur envoi par NeuroCheckout Cloud." },
    "journey-audit": { label: "Audit du parcours", eyebrow: "Preuves du parcours client", title: "Audit du parcours client", description: "Examinez les parcours utiles, les fuites de revenu probables et les relais possibles entre agents." },
    "sync-health": { label: "État de la synchro", eyebrow: "Fiabilité de bout en bout", title: "État de la synchronisation", description: "Suivez chaque événement, du connecteur boutique jusqu’à sa preuve de traitement Cloud." },
    messages: { label: "Messages internes", eyebrow: "Conseils opérationnels", title: "Messages internes", description: "Consultez les informations opérationnelles, alertes de compte et conseils destinés à votre espace." },
    "partner-program": { label: "Programme partenaire", eyebrow: "Attribution partenaire", title: "Programme partenaire", description: "Gérez votre lien de recommandation, les clients attribués, les commissions et les demandes de paiement." },
    features: { label: "Offre & données", eyebrow: "Accès sécurisé au compte", title: "Offre, accès et données", description: "Gérez votre abonnement et consultez les garanties appliquées à vos données." },
    configuration: { label: "Configuration", eyebrow: "Personnalisation contrôlée", title: "Boutique, emails et connecteur", description: "Configurez uniquement l’outil dont vous avez besoin, sans parcourir une longue page." },
  },
};

const AGENT_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: {
    customer_preference_proactive: "Proactive product advisor",
    abandoned_cart: "Abandoned cart recovery",
    contextual_product_recommendation: "Personalized recommendations",
    intelligent_email_marketing: "Email orchestration",
    upsell_cross_sell_dynamic: "Upsell and cross-sell",
    automatic_customer_segmentation: "Customer segmentation",
    contextual_support_order_aware: "Contextual support",
    business_alerts_anomalies: "Business alerts",
  },
  fr: {
    customer_preference_proactive: "Conseiller produit proactif",
    abandoned_cart: "Relance panier abandonné",
    contextual_product_recommendation: "Recommandations personnalisées",
    intelligent_email_marketing: "Orchestration email",
    upsell_cross_sell_dynamic: "Upsell et cross-sell",
    automatic_customer_segmentation: "Segmentation client",
    contextual_support_order_aware: "Support contextuel",
    business_alerts_anomalies: "Alertes business",
  },
};

const AGENT_ROLES: Record<UiLanguage, Record<string, string>> = {
  en: {
    customer_preference_proactive: "Preference",
    abandoned_cart: "Conversion",
    contextual_product_recommendation: "Recommendation",
    intelligent_email_marketing: "Communication",
    upsell_cross_sell_dynamic: "Revenue",
    automatic_customer_segmentation: "Audience",
    contextual_support_order_aware: "Support",
    business_alerts_anomalies: "Monitoring",
  },
  fr: {
    customer_preference_proactive: "Préférence",
    abandoned_cart: "Conversion",
    contextual_product_recommendation: "Recommandation",
    intelligent_email_marketing: "Communication",
    upsell_cross_sell_dynamic: "Revenu",
    automatic_customer_segmentation: "Audience",
    contextual_support_order_aware: "Support",
    business_alerts_anomalies: "Surveillance",
  },
};

const SUPPORT_AGENT = "contextual_support_order_aware";
const SUPERVISOR_AGENT = "agent_supervisor";

function viewFromHash(): DashboardView {
  if (typeof window === "undefined") return "overview";
  const candidate = window.location.hash.replace("#", "") as DashboardView;
  return candidate in VIEW_COPY.en ? candidate : "overview";
}

let localDataBootstrapPromise: Promise<void> | null = null;

async function ensureEncryptedLocalSynchronization(): Promise<void> {
  if (localDataBootstrapPromise) return localDataBootstrapPromise;
  localDataBootstrapPromise = (async () => {
    const statusResponse = await fetch("/api/local-data/setup", { cache: "no-store" });
    const localStatus = await statusResponse.json().catch(() => ({})) as {
      available?: boolean;
      configured?: boolean;
    };
    if (!statusResponse.ok || localStatus.available === false || localStatus.configured) return;

    const shopsResponse = await fetch("/api/cloud/shops", { cache: "no-store" });
    const shopsPayload = await shopsResponse.json().catch(() => ({})) as {
      items?: Array<{ shop_uuid?: string; uuid?: string; has_active_api_key?: boolean }>;
    };
    if (!shopsResponse.ok) throw new Error("local_data_shop_unavailable");
    const candidates = (Array.isArray(shopsPayload.items) ? shopsPayload.items : [])
      .filter((shop) => shop.has_active_api_key === true);
    if (candidates.length !== 1) return;
    const shopUuid = String(candidates[0].shop_uuid || candidates[0].uuid || "").trim();
    if (!shopUuid) return;

    const setupResponse = await fetch("/api/local-data/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_uuid: shopUuid }),
    });
    if (!setupResponse.ok) throw new Error("local_data_setup_failed");
  })();
  try {
    await localDataBootstrapPromise;
  } finally {
    localDataBootstrapPromise = null;
  }
}

export default function Dashboard() {
  const { language, setLanguage } = useUiLanguage();
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [syncDelayed, setSyncDelayed] = useState(false);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const load = async (silent = false): Promise<boolean> => {
    if (!silent) setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/cloud/capabilities", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Capabilities & { detail?: string };
      if (response.status === 401) {
        setCapabilities(null);
        setStatus("disconnected");
        setSyncDelayed(false);
        if (payload.detail && payload.detail !== "community_not_connected") {
          setError(publicErrorMessage(
            payload.detail,
            { en: "Reconnect this installation to continue.", fr: "Reconnectez cette installation pour continuer." },
            language,
          ));
        }
        return false;
      }
      if (!response.ok) throw new Error(publicErrorMessage(
        payload.detail,
        { en: "NeuroCheckout is temporarily unavailable.", fr: "NeuroCheckout est temporairement indisponible." },
        language,
      ));
      setCapabilities(payload);
      setStatus("connected");
      setSyncDelayed(false);
      setLastSuccessfulSyncAt(new Date());
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : ui("Cloud unavailable", "Cloud indisponible"));
      if (silent) setSyncDelayed(true);
      else setStatus("error");
      return false;
    }
  };

  useEffect(() => {
    setActiveView(viewFromHash());
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const currentUrl = new URL(window.location.href);
    const billingResult = currentUrl.searchParams.get("billing");
    const checkoutSessionId = currentUrl.searchParams.get("session_id");
    const clearCheckoutIntents = () => {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
          for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith("nc-community-checkout-intent:")) storage.removeItem(key);
          }
        } catch {
          // Browser storage can be disabled independently of the authenticated
          // Cloud confirmation; successful confirmation still remains valid.
        }
      }
    };
    const cleanBillingUrl = (removeSession: boolean) => {
      currentUrl.searchParams.delete("billing");
      if (removeSession) currentUrl.searchParams.delete("session_id");
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash || "#features"}`);
    };
    const confirmCheckout = async (attempt: number) => {
      if (!checkoutSessionId || stopped) return;
      setBillingNotice(ui("Confirming your subscription…", "Confirmation de votre abonnement…"));
      let response: Response;
      try {
        response = await fetch("/api/cloud/subscription/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: checkoutSessionId }),
        });
      } catch {
        setBillingNotice(attempt < 5
          ? ui("Cloud confirmation is temporarily unavailable; retrying automatically.", "La confirmation Cloud est temporairement indisponible ; nouvelle tentative automatique.")
          : ui("Automatic confirmation did not complete. Reload this page to retry safely.", "La confirmation automatique n’a pas abouti. Rechargez cette page pour réessayer en sécurité."));
        if (attempt < 5 && !stopped) {
          const delay = Math.min(30_000, 2_000 * (2 ** attempt));
          retryTimer = setTimeout(() => void confirmCheckout(attempt + 1), delay);
        }
        return;
      }
      const payload = await response.json().catch(() => ({})) as { confirmed?: boolean; detail?: string };
      if (response.ok && payload.confirmed) {
        clearCheckoutIntents();
        cleanBillingUrl(true);
        setBillingNotice(ui("Subscription confirmed. Cloud entitlements are active in this Community interface.", "Abonnement confirmé. Les droits Cloud sont actifs dans cette interface Community."));
        await load();
        return;
      }
      if (payload.detail === "community_scope_required" || response.status === 401) {
        setBillingNotice(ui("Reconnect this installation once to confirm billing securely.", "Reconnectez cette installation une fois pour confirmer la facturation en sécurité."));
        return;
      }
      setBillingNotice(attempt < 5
        ? ui("Payment received. Entitlements are still being synchronized; confirmation will retry automatically.", "Paiement reçu. Les droits sont encore en cours de synchronisation ; la confirmation sera retentée automatiquement.")
        : ui("Payment was received but automatic confirmation did not complete. Reload this page to retry safely.", "Le paiement a été reçu, mais la confirmation automatique n’a pas abouti. Rechargez cette page pour réessayer en sécurité."));
      if (attempt < 5 && !stopped) {
        const delay = Math.min(30_000, 2_000 * (2 ** attempt));
        retryTimer = setTimeout(() => void confirmCheckout(attempt + 1), delay);
      }
    };

    if (billingResult === "success" && checkoutSessionId) {
      setActiveView("features");
      void load();
      void confirmCheckout(0);
    } else {
      if (billingResult === "cancel") {
        setBillingNotice(ui("Checkout cancelled. Your current plan and local data are unchanged. You can safely resume the same selection.", "Paiement annulé. Votre offre actuelle et vos données locales restent inchangées. Vous pouvez reprendre le même choix en sécurité."));
      } else if (billingResult === "upgrade-return" || billingResult === "portal-return") {
        setBillingNotice(ui("Billing updated. Cloud entitlements are being refreshed.", "Facturation mise à jour. Les droits Cloud sont en cours d’actualisation."));
      }
      if (billingResult) {
        setActiveView("features");
        cleanBillingUrl(true);
      }
      void load();
    }
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (status !== "connected" || !capabilities) return;
    const refreshSeconds = Math.min(300, Math.max(30, Number(capabilities.manifest?.refresh_after_seconds || 60)));
    let stopped = false;
    let failures = 0;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        const refreshed = await load(true);
        failures = refreshed ? 0 : Math.min(5, failures + 1);
        if (!stopped) {
          const baseDelay = refreshSeconds * 1000 * (2 ** failures);
          const jitter = Math.round(baseDelay * (Math.random() * 0.2 - 0.1));
          schedule(Math.min(300_000, Math.max(10_000, baseDelay + jitter)));
        }
      }, delay);
    };
    schedule(refreshSeconds * 1000);
    const refresh = () => void load(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, capabilities?.manifest?.refresh_after_seconds]);

  useEffect(() => {
    if (status !== "connected") return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const activate = async () => {
      try {
        await ensureEncryptedLocalSynchronization();
      } catch {
        if (!stopped) retry = setTimeout(() => void activate(), 30_000);
      }
    };
    void activate();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
    };
  }, [status]);

  const selectView = (view: DashboardView) => {
    setActiveView(view);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${view}`);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCapabilities(null);
    setStatus("disconnected");
  };

  const emailLimit = capabilities?.limits.emails.limit;
  const emailUsed = capabilities?.limits.emails.used;
  const emailRemaining = capabilities?.limits.emails.remaining;
  const emailRemainingLabel = emailRemaining !== null && emailRemaining !== undefined
    ? emailRemaining
    : emailLimit === null
      ? ui("Unlimited", "Illimité")
      : "—";
  const emailRatio = emailLimit && emailUsed !== null && emailUsed !== undefined
    ? Math.min(100, Math.round((emailUsed / emailLimit) * 100))
    : 0;
  const nextEmailRelease = capabilities?.limits.emails.next_release_at
    ? new Date(capabilities.limits.emails.next_release_at).toLocaleString(language === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;
  const enabledFeatures = Object.entries(capabilities?.features || {}).filter(([, enabled]) => enabled);
  const viewCopy = VIEW_COPY[language][activeView];
  const specializedAgents = (capabilities?.agents.available || []).filter(
    (agent) => agent !== SUPPORT_AGENT || Boolean(capabilities?.agents.supervisor),
  );
  const supervisorEnabled = capabilities?.agents.supervisor?.enabled
    ?? capabilities?.agents.coordination_enabled
    ?? false;
  const visibleAgents = supervisorEnabled
    ? [SUPERVISOR_AGENT, ...specializedAgents]
    : specializedAgents;
  const activeAgentCount = capabilities?.agents.active_count ?? visibleAgents.length;
  const navigationViews = (Object.keys(VIEW_COPY.en) as DashboardView[]).filter((view) => {
    if (!capabilities) return view === "overview";
    if (view === "email-approvals") return capabilities.features.email_approvals === true;
    if (view === "messages") return capabilities.features.member_messages === true;
    if (view === "partner-program") return capabilities.features.partner_program === true;
    if (view === "journey-audit") return capabilities.features.journey_audit === true;
    if (view === "sync-health") return capabilities.features.sync_health === true;
    if (view === "agent-performance") return capabilities.features.agent_performance === true;
    if (view === "converted-orders") return capabilities.features.converted_orders === true;
    return capabilities.features.member_dashboard !== false;
  });

  useEffect(() => {
    if ((status === "disconnected" || status === "error") && activeView !== "overview") {
      selectView("overview");
      return;
    }
    if (capabilities && !navigationViews.includes(activeView)) selectView("overview");
  }, [activeView, capabilities, status]);

  const upgradeAction = capabilities?.upgrade.available ? (
    <button className="button secondary-blue" type="button" onClick={() => selectView("features")}>
      {ui("Compare plans", "Comparer les offres")}
    </button>
  ) : null;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-logo"
            src="/branding/neurocheckout-logo-300.png"
            alt=""
            width="40"
            height="40"
          />
          <div><strong>NeuroCheckout</strong><small>Community</small></div>
        </div>

        <nav aria-label={ui("Main navigation", "Navigation principale")}>
          {navigationViews.map((view, index) => (
            <button
              className={`nav-link${activeView === view ? " active" : ""}`}
              key={view}
              type="button"
              onClick={() => selectView(view)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {VIEW_COPY[language][view].label}
            </button>
          ))}
        </nav>

        <div className="boundary-note">
          <span className="status-dot" />
          <div><strong>{ui("Self-hosted interface", "Interface auto-hébergée")}</strong><p>{ui("Securely connected to NeuroCheckout services.", "Connectée de manière sécurisée aux services NeuroCheckout.")}</p></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{viewCopy.eyebrow}</p>
            <h1>{viewCopy.title}</h1>
            <p className="view-description">{viewCopy.description}</p>
          </div>
          <div className="topbar-actions">
            <div className="language-switch" role="group" aria-label={ui("Interface language", "Langue de l’interface")}>
              <button className={language === "en" ? "active" : ""} type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
              <button className={language === "fr" ? "active" : ""} type="button" aria-pressed={language === "fr"} onClick={() => setLanguage("fr")}>FR</button>
            </div>
            {capabilities ? (
              <span className={`cloud-status${syncDelayed ? " delayed" : ""}`} title={lastSuccessfulSyncAt ? `${ui("Last successful sync", "Dernière synchronisation réussie")} ${lastSuccessfulSyncAt.toLocaleString(language === "fr" ? "fr-FR" : "en-US")}` : undefined}><span className="status-dot" />{syncDelayed ? ui("Cloud sync delayed", "Synchronisation Cloud retardée") : ui("Cloud synced", "Cloud synchronisé")}</span>
            ) : null}
            {status === "connected" ? (
              <button className="button ghost" type="button" onClick={logout}>{ui("Disconnect", "Déconnecter")}</button>
            ) : null}
          </div>
        </header>

        {status === "loading" ? (
          <div className="state-panel"><span className="loader" /><p>{ui("Securely syncing with NeuroCheckout Cloud…", "Synchronisation sécurisée avec NeuroCheckout Cloud…")}</p></div>
        ) : null}

        {status === "disconnected" || status === "error" ? (
          <section className="connect-panel view-enter">
            <p className="eyebrow">{ui("Connection required", "Connexion requise")}</p>
            <h2>{ui("Connect this instance to your Cloud account", "Reliez cette instance à votre compte Cloud")}</h2>
            <p>{ui("Confirm permissions in NeuroCheckout Cloud. Community never collects or stores your password.", "Confirmez les permissions dans NeuroCheckout Cloud. Aucun mot de passe n’est saisi ni stocké dans Community.")}</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="actions">
              <a className="button primary" href="/api/auth/start">{ui("Connect to Cloud", "Connecter au Cloud")}</a>
              {status === "error" ? <button className="button ghost" type="button" onClick={() => void load()}>{ui("Try again", "Réessayer")}</button> : null}
            </div>
          </section>
        ) : null}

        {capabilities ? (
          <>
            {capabilities.dashboard?.update_required ? (
              <section className="compatibility-alert" role="alert">
                <strong>{ui("Update required", "Mise à jour obligatoire")}</strong>
                <LocalUpdate french={language === "fr"} />
                <p>{ui("This interface", "Cette interface")} ({capabilities.dashboard.current_version || ui("unknown version", "version inconnue")}) {ui("must be updated to at least version", "doit être mise à jour vers la version")} {capabilities.dashboard.minimum_version} {ui(".", "minimum.")}</p>
              </section>
            ) : capabilities.dashboard?.update_recommended ? (
              <section className="compatibility-alert recommended">
                <strong>{ui("Update available", "Mise à jour disponible")}</strong>
                <LocalUpdate french={language === "fr"} />
                <p>{ui("NeuroCheckout Community version", "La version")} {capabilities.dashboard.latest_version} {ui("is available.", "de NeuroCheckout Community est disponible.")}</p>
              </section>
            ) : null}

            {activeView === "overview" ? (
              <div className="view-enter overview-view">
                {(capabilities.connectors || []).filter((connector) => connector.status !== "current").map((connector) => (
                  <section className={`compatibility-alert${connector.status === "available" ? " recommended" : ""}`} role="alert" key={`${connector.shop_id}-${connector.platform}`}>
                    <strong>{connector.status === "available" ? ui("Connector update available", "Mise à jour du connecteur disponible") : ui("Connector update required", "Mise à jour du connecteur obligatoire")}</strong>
                    <p>
                      {connector.shop_id} · {connector.platform}: {connector.installed_version} → {connector.latest_version}. {ui("Back up the store, download the official package and upload it over the installed connector. Do not uninstall it; its configuration and data are preserved.", "Sauvegardez la boutique, téléchargez le paquet officiel puis chargez-le par-dessus le connecteur installé. Ne le désinstallez pas : sa configuration et ses données sont conservées.")}
                    </p>
                    <a className="button ghost" href={connector.release_url} target="_blank" rel="noopener noreferrer">{ui("Download official update", "Télécharger la mise à jour officielle")}</a>
                  </section>
                ))}
                <section className="command-surface">
                  <div className="edition-summary">
                    <p className="eyebrow">{ui("Active edition", "Édition active")}</p>
                    <div className="edition-title">
                      <h2>{capabilities.plan.code === "community" ? "Community" : `Community · ${capabilities.plan.code.toUpperCase()}`}</h2>
                      <span className="status-pill"><span className="status-dot" />{publicEnumLabel(capabilities.subscription.status, language, ui("Status unavailable", "Statut indisponible"))}</span>
                    </div>
                    <p>{ui("Permissions verified securely for this account", "Autorisations vérifiées de manière sécurisée pour ce compte")}</p>
                  </div>
                  <div className="metric-rail" aria-label={ui("Account limits", "Limites du compte")}>
                    <article className="metric">
                      <p>{ui("Stores", "Boutiques")}</p>
                      <strong>{capabilities.limits.shops ?? "∞"}</strong>
                      <small>{ui("maximum", "maximum")}</small>
                    </article>
                    <article className="metric">
                      <p>Agents</p>
                      <strong>{activeAgentCount || capabilities.limits.active_agents || "∞"}</strong>
                      <small>{supervisorEnabled ? `${ui("Coordination", "Coordination")} + ${specializedAgents.length} ${ui("specialists", "spécialisés")}` : `${specializedAgents.length} ${ui("specialists", "spécialisés")}`}</small>
                    </article>
                    <article className="metric quota-metric">
                      <div><p>Emails</p><strong>{emailUsed ?? "—"}<em>/ {emailLimit ?? "∞"}</em></strong></div>
                      <div className="meter" aria-label={`${emailRatio}% ${ui("of email quota used", "du quota email utilisé")}`}><span style={{ width: `${emailRatio}%` }} /></div>
                      <small>{emailRemainingLabel} {ui("available", "disponibles")}</small>
                    </article>
                  </div>
                </section>

                <div className="overview-columns">
                  <section className="workspace-panel">
                    <div className="panel-heading"><div><p className="eyebrow">{ui("Automated services", "Services automatisés")}</p><h2>{ui("Available agents", "Agents disponibles")}</h2></div><button type="button" onClick={() => selectView("agents")}>{ui("View all", "Voir les")} {activeAgentCount}</button></div>
                    <div className="agent-preview-grid">
                      {visibleAgents.slice(0, 4).map((agent, index) => (
                        <article key={agent} className={`agent-preview${agent === SUPERVISOR_AGENT ? " supervisor-preview" : ""}`}>
                          <span className="agent-preview-avatar">
                            <img src={agentAvatar(agent)} alt="" width="38" height="38" />
                            <small>{String(index + 1).padStart(2, "0")}</small>
                          </span>
                          <div><strong>{agent === SUPERVISOR_AGENT ? ui("Service coordination", "Coordination du service") : AGENT_LABELS[language][agent] || publicAgentLabel(agent, language)}</strong><small>{agent === SUPERVISOR_AGENT ? ui("Automated coordination", "Coordination automatisée") : AGENT_ROLES[language][agent] || "Agent"}</small></div>
                          <i aria-label={ui("Active", "Actif")} />
                        </article>
                      ))}
                    </div>
                  </section>

                  <aside className="action-panel">
                    <p className="eyebrow">{ui("Quick access", "Accès rapide")}</p>
                    <h2>{ui("Continue configuration", "Continuer la configuration")}</h2>
                    <p>{ui("Manage your store, emails, AI key or connector from one focused workspace.", "Gérez la boutique, les emails, votre clé IA ou le connecteur depuis un espace dédié.")}</p>
                    <button className="button primary" type="button" onClick={() => selectView("configuration")}>{ui("Open configuration", "Ouvrir la configuration")}</button>
                    <div className="feature-count"><strong>{enabledFeatures.length}</strong><span>{ui("active features", "fonctionnalités actives")}</span></div>
                  </aside>
                </div>

                {capabilities.upgrade.available ? (
                  <section className="upgrade-line"><div><strong>{ui("Need more capacity?", "Besoin de plus de capacité ?")}</strong><span>{ui("Keep this interface and activate Cloud access without migration.", "Gardez cette interface et activez les droits Cloud sans migration.")}</span></div>{upgradeAction}</section>
                ) : null}
              </div>
            ) : null}

            {activeView === "agents" ? (
              <section className="view-enter agents-view">
                <div className="section-toolbar"><span>{specializedAgents.length} {ui("active specialist agents", "agents spécialisés actifs")}</span><span>{ui("Coordination", "Coordination")} {supervisorEnabled ? ui("active", "active") : ui("inactive", "inactive")}</span></div>
                {supervisorEnabled ? (
                  <article className="supervisor-band">
                    <div className="supervisor-avatar">
                      <img src={SUPERVISOR_AVATAR} alt="" width="58" height="58" />
                    </div>
                    <div>
                      <p className="eyebrow">{ui("Automated service", "Service automatisé")}</p>
                      <h2>{ui("Service coordination", "Coordination du service")}</h2>
                      <p>{ui("Keeps enabled features working together for your store.", "Assure le fonctionnement coordonné des fonctionnalités activées pour votre boutique.")}</p>
                    </div>
                    <span className="status-pill"><span className="status-dot" />{ui("Active", "Actif")}</span>
                  </article>
                ) : null}
                <div className="agent-matrix">
                  {specializedAgents.map((agent, index) => (
                    <article key={agent} className="agent-cell">
                      <div className="agent-cell-top"><span>{String(index + 1).padStart(2, "0")}</span><i aria-label={ui("Active", "Actif")} /></div>
                      <div className="agent-cell-identity">
                        <img src={agentAvatar(agent)} alt="" width="62" height="62" />
                        <div>
                          <h2>{AGENT_LABELS[language][agent] || publicAgentLabel(agent, language)}</h2>
                          <p>{AGENT_ROLES[language][agent] || ui("Specialist agent", "Agent spécialisé")}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeView === "usage" ? (
              <section className="view-enter usage-view">
                <div className="usage-primary">
                  <div className="usage-number"><span>{ui("Emails used", "Emails utilisés")}</span><strong>{emailUsed ?? "—"}</strong><small>{ui("of", "sur")} {emailLimit ?? "∞"} · {ui("current plan window", "fenêtre de l’offre actuelle")}</small></div>
                  <div className="usage-meter"><div className="meter"><span style={{ width: `${emailRatio}%` }} /></div><strong>{emailRatio}%</strong></div>
                  <p>{capabilities.limits.emails.remaining === null
                    ? capabilities.limits.emails.limit === null
                      ? ui("This plan has no fixed email cap.", "Cette offre n’a pas de plafond email fixe.")
                      : ui("Usage is temporarily unavailable; Cloud still enforces the plan limit.", "La consommation est temporairement indisponible ; le Cloud applique toujours la limite de l’offre.")
                    : `${capabilities.limits.emails.remaining} ${ui("emails remain available in this window.", "emails restent disponibles pour cette fenêtre.")}`}</p>
                  <div className="quota-window-explainer">
                    <strong>{capabilities.limits.emails.window === "rolling_24h" ? nextEmailRelease ? ui("Next capacity release", "Prochaine capacité libérée") : ui("Rolling quota is current", "Quota glissant à jour") : ui("Monthly plan quota", "Quota mensuel de l’offre")}</strong>
                    <span>{capabilities.limits.emails.window === "rolling_24h" ? nextEmailRelease || ui("No email is currently waiting to leave the counting window.", "Aucun email n’attend actuellement de sortir de la fenêtre de comptage.") : ui("Cloud remains authoritative for usage and quota enforcement.", "Le Cloud reste l’autorité pour la consommation et le contrôle du quota.")}</span>
                    <small>{capabilities.limits.emails.window === "rolling_24h" ? ui(`Each successful send stops counting individually after ${capabilities.limits.emails.window_hours || 24} hours; the total does not reset all at once.`, `Chaque envoi réussi cesse d’être compté individuellement après ${capabilities.limits.emails.window_hours || 24} heures ; le total ne se réinitialise pas d’un seul coup.`) : ui("The billing period and limits are recalculated server-side after every plan change.", "La période de facturation et les limites sont recalculées côté serveur après chaque changement d’offre.")}</small>
                  </div>
                </div>
                <div className="usage-facts">
                  <div><span>{ui("Allowed stores", "Boutiques autorisées")}</span><strong>{capabilities.limits.shops ?? "∞"}</strong></div>
                  <div><span>{ui("Available agents", "Agents disponibles")}</span><strong>{activeAgentCount || capabilities.limits.active_agents || "∞"}</strong></div>
                  <div><span>{ui("Quota scope", "Périmètre du quota")}</span><strong>{capabilities.limits.emails.scope || ui("Account", "Compte")}</strong></div>
                  <div><span>{ui("Subscription status", "Statut abonnement")}</span><strong>{publicEnumLabel(capabilities.subscription.status, language, ui("Status unavailable", "Statut indisponible"))}</strong></div>
                </div>
                {capabilities.upgrade.available ? <div className="usage-upgrade"><p>{ui("Higher limits are activated automatically after subscription.", "Les limites supérieures sont activées automatiquement après souscription.")}</p>{upgradeAction}</div> : null}
              </section>
            ) : null}

            {activeView === "email-approvals" && capabilities.features.email_approvals ? (
              <EmailApprovals language={language} />
            ) : null}

            {activeView === "agent-performance" && capabilities.features.agent_performance ? (
              <AgentPerformance language={language} supervisorEnabled={supervisorEnabled} />
            ) : null}

            {activeView === "converted-orders" && capabilities.features.converted_orders ? (
              <ConvertedOrders language={language} recentEmailsEnabled={capabilities.features.recent_emails === true} />
            ) : null}

            {activeView === "journey-audit" && capabilities.features.journey_audit ? (
              <JourneyAudit language={language} />
            ) : null}

            {activeView === "sync-health" && capabilities.features.sync_health ? (
              <SynchronizationHealth language={language} connectors={capabilities.connectors || []} />
            ) : null}

            {activeView === "messages" && capabilities.features.member_messages ? (
              <MemberMessages language={language} />
            ) : null}

            {activeView === "partner-program" && capabilities.features.partner_program ? (
              <PartnerProgram language={language} />
            ) : null}

            {activeView === "features" ? (
              <PlanAndData
                capabilities={capabilities}
                language={language}
                billingNotice={billingNotice}
                onRefresh={async () => {
                  if (!await load(true)) throw new Error("entitlement_refresh_failed");
                }}
              />
            ) : null}

            {activeView === "configuration" ? <div className="view-enter"><CloudConfiguration /></div> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
