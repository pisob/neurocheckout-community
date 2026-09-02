"use client";

import { useEffect, useState } from "react";
import CloudConfiguration from "@/components/CloudConfiguration";
import EmailApprovals from "@/components/EmailApprovals";
import MemberMessages from "@/components/MemberMessages";
import AgentPerformance from "@/components/AgentPerformance";
import ConvertedOrders from "@/components/ConvertedOrders";
import { agentAvatar, SUPERVISOR_AVATAR } from "@/lib/agent-visuals";
import { useUiLanguage, type UiLanguage } from "@/lib/ui-language";

type Capabilities = {
  schema_version: string;
  plan: { code: string; edition: "community" | "cloud" };
  subscription: { status: string; active: boolean };
  limits: {
    shops: number | null;
    active_agents: number | null;
    emails: {
      limit: number | null;
      used: number | null;
      remaining: number | null;
      window: string | null;
      scope: string | null;
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
  upgrade: {
    available: boolean;
    target_plans: string[];
    same_member_api: boolean;
    self_hosted_dashboard_can_continue: boolean;
  };
};

type DashboardView = "overview" | "agents" | "agent-performance" | "converted-orders" | "usage" | "email-approvals" | "messages" | "features" | "configuration";

type ViewCopy = Record<DashboardView, { label: string; eyebrow: string; title: string; description: string }>;

const VIEW_COPY: Record<UiLanguage, ViewCopy> = {
  en: {
    overview: { label: "Overview", eyebrow: "Operations center", title: "Installation status", description: "Quotas, agents and Cloud access in one control view." },
    agents: { label: "Agents", eyebrow: "Shared orchestration", title: "Available agents", description: "Active roles cooperate in the Cloud to make every decision more reliable." },
    "agent-performance": { label: "Agent performance", eyebrow: "Measured contribution", title: "Agent performance", description: "Compare attributed value, engagement and operational impact for one store and period." },
    "converted-orders": { label: "Orders & emails", eyebrow: "Customer activity evidence", title: "Orders and email activity", description: "Inspect attributed orders and the latest 10 emails sent by NeuroCheckout Cloud without exposing full customer contact data." },
    usage: { label: "Usage", eyebrow: "Community capacity", title: "Quotas and usage", description: "Track your email window and the limits applied by your plan." },
    "email-approvals": { label: "Email approvals", eyebrow: "Delivery control", title: "Emails to approve", description: "Review manual-approval emails before NeuroCheckout Cloud sends them." },
    messages: { label: "Messages", eyebrow: "Account notices", title: "Member messages", description: "Read quota, account and service notices issued for your workspace." },
    features: { label: "Features", eyebrow: "Cloud-calculated access", title: "Available features", description: "Access is recalculated server-side whenever your plan changes." },
    configuration: { label: "Configuration", eyebrow: "Controlled customization", title: "Store, email and connector", description: "Configure only the tool you need from a focused workspace." },
  },
  fr: {
    overview: { label: "Vue d’ensemble", eyebrow: "Centre opérationnel", title: "État de votre installation", description: "Quotas, agents et accès Cloud réunis dans une vue de contrôle." },
    agents: { label: "Agents", eyebrow: "Orchestration partagée", title: "Agents disponibles", description: "Les rôles actifs coopèrent dans le Cloud pour fiabiliser chaque décision." },
    "agent-performance": { label: "Performance des agents", eyebrow: "Contribution mesurée", title: "Performance des agents", description: "Comparez la valeur attribuée, l’engagement et l’impact opérationnel par boutique et période." },
    "converted-orders": { label: "Commandes & emails", eyebrow: "Preuves d’activité client", title: "Commandes et activité email", description: "Inspectez les commandes attribuées et les 10 derniers emails envoyés par NeuroCheckout Cloud sans exposer toutes les coordonnées client." },
    usage: { label: "Utilisation", eyebrow: "Capacité Community", title: "Quotas et consommation", description: "Suivez la fenêtre email et les limites appliquées par votre offre." },
    "email-approvals": { label: "Validations email", eyebrow: "Contrôle des envois", title: "Emails à approuver", description: "Vérifiez les emails en validation manuelle avant leur envoi par NeuroCheckout Cloud." },
    messages: { label: "Messages", eyebrow: "Notifications du compte", title: "Messages membre", description: "Consultez les alertes de quota, de compte et de service de votre espace." },
    features: { label: "Fonctionnalités", eyebrow: "Droits calculés par le Cloud", title: "Fonctionnalités disponibles", description: "Les accès sont recalculés côté serveur à chaque changement d’offre." },
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

function displayFeature(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function viewFromHash(): DashboardView {
  if (typeof window === "undefined") return "overview";
  const candidate = window.location.hash.replace("#", "") as DashboardView;
  return candidate in VIEW_COPY.en ? candidate : "overview";
}

export default function Dashboard() {
  const { language, setLanguage } = useUiLanguage();
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");

  const load = async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/cloud/capabilities", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Capabilities & { detail?: string };
      if (response.status === 401) {
        setCapabilities(null);
        setStatus("disconnected");
        if (payload.detail && payload.detail !== "community_not_connected") setError(payload.detail);
        return;
      }
      if (!response.ok) throw new Error(payload.detail || ui("Cloud unavailable", "Cloud indisponible"));
      setCapabilities(payload);
      setStatus("connected");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : ui("Cloud unavailable", "Cloud indisponible"));
      setStatus("error");
    }
  };

  useEffect(() => {
    setActiveView(viewFromHash());
    void load();
  }, []);

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
  const emailUsed = capabilities?.limits.emails.used ?? 0;
  const emailRatio = emailLimit ? Math.min(100, Math.round((emailUsed / emailLimit) * 100)) : 0;
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
    <a className="button secondary-blue" href="/api/upgrade" target="_blank" rel="noreferrer">
      {ui("Compare plans", "Comparer les offres")}
    </a>
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
          <div><strong>{ui("Self-hosted interface", "Interface auto-hébergée")}</strong><p>{ui("Business logic and decisions remain secured in NeuroCheckout Cloud.", "Logique métier et décisions sécurisées dans NeuroCheckout Cloud.")}</p></div>
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
              <span className="cloud-status"><span className="status-dot" />{ui("Cloud synced", "Cloud synchronisé")}</span>
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
                <p>{ui("This interface", "Cette interface")} ({capabilities.dashboard.current_version || ui("unknown version", "version inconnue")}) {ui("must be updated to at least version", "doit être mise à jour vers la version")} {capabilities.dashboard.minimum_version} {ui(".", "minimum.")}</p>
              </section>
            ) : capabilities.dashboard?.update_recommended ? (
              <section className="compatibility-alert recommended">
                <strong>{ui("Update available", "Mise à jour disponible")}</strong>
                <p>{ui("NeuroCheckout Community version", "La version")} {capabilities.dashboard.latest_version} {ui("is available.", "de NeuroCheckout Community est disponible.")}</p>
              </section>
            ) : null}

            {activeView === "overview" ? (
              <div className="view-enter overview-view">
                <section className="command-surface">
                  <div className="edition-summary">
                    <p className="eyebrow">{ui("Active edition", "Édition active")}</p>
                    <div className="edition-title">
                      <h2>{capabilities.plan.edition === "community" ? "Community" : "Cloud"}</h2>
                      <span className="status-pill"><span className="status-dot" />{capabilities.subscription.status}</span>
                    </div>
                    <p>{ui("API contract", "Contrat API")} {capabilities.schema_version} · {ui("access recalculated server-side", "droits recalculés côté serveur")}</p>
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
                      <small>{supervisorEnabled ? `1 supervisor + ${specializedAgents.length} ${ui("specialists", "spécialisés")}` : `${specializedAgents.length} ${ui("specialists", "spécialisés")}`}</small>
                    </article>
                    <article className="metric quota-metric">
                      <div><p>Emails</p><strong>{emailUsed}<em>/ {emailLimit ?? "∞"}</em></strong></div>
                      <div className="meter" aria-label={`${emailRatio}% ${ui("of email quota used", "du quota email utilisé")}`}><span style={{ width: `${emailRatio}%` }} /></div>
                      <small>{capabilities.limits.emails.remaining ?? ui("Unlimited", "Illimité")} {ui("available", "disponibles")}</small>
                    </article>
                  </div>
                </section>

                <div className="overview-columns">
                  <section className="workspace-panel">
                    <div className="panel-heading"><div><p className="eyebrow">{ui("Orchestration", "Orchestration")}</p><h2>{ui("Agent network", "Réseau d’agents")}</h2></div><button type="button" onClick={() => selectView("agents")}>{ui("View all", "Voir les")} {activeAgentCount}</button></div>
                    <div className="agent-preview-grid">
                      {visibleAgents.slice(0, 4).map((agent, index) => (
                        <article key={agent} className={`agent-preview${agent === SUPERVISOR_AGENT ? " supervisor-preview" : ""}`}>
                          <span className="agent-preview-avatar">
                            <img src={agentAvatar(agent)} alt="" width="38" height="38" />
                            <small>{String(index + 1).padStart(2, "0")}</small>
                          </span>
                          <div><strong>{agent === SUPERVISOR_AGENT ? "Supervisor" : AGENT_LABELS[language][agent] || displayFeature(agent)}</strong><small>{agent === SUPERVISOR_AGENT ? ui("Central coordination", "Coordination centrale") : AGENT_ROLES[language][agent] || "Agent"}</small></div>
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
                <div className="section-toolbar"><span>{specializedAgents.length} {ui("active specialist agents", "agents spécialisés actifs")}</span><span>Supervisor {supervisorEnabled ? ui("active", "actif") : ui("inactive", "inactif")}</span></div>
                {supervisorEnabled ? (
                  <article className="supervisor-band">
                    <div className="supervisor-avatar">
                      <img src={SUPERVISOR_AVATAR} alt="" width="58" height="58" />
                    </div>
                    <div>
                      <p className="eyebrow">{ui("Coordination layer", "Couche de coordination")}</p>
                      <h2>{capabilities.agents.supervisor?.display_name || "Supervisor"}</h2>
                      <p>{capabilities.agents.supervisor?.description || ui("Coordinates specialist agents and makes their decisions more reliable.", "Coordonne les agents spécialisés et fiabilise leurs décisions.")}</p>
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
                          <h2>{AGENT_LABELS[language][agent] || displayFeature(agent)}</h2>
                          <p>{AGENT_ROLES[language][agent] || ui("Specialist agent", "Agent spécialisé")}</p>
                        </div>
                      </div>
                      <code>{agent}</code>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeView === "usage" ? (
              <section className="view-enter usage-view">
                <div className="usage-primary">
                  <div className="usage-number"><span>{ui("Emails used", "Emails utilisés")}</span><strong>{emailUsed}</strong><small>{ui("of", "sur")} {emailLimit ?? "∞"} · {ui("rolling window", "fenêtre glissante")}</small></div>
                  <div className="usage-meter"><div className="meter"><span style={{ width: `${emailRatio}%` }} /></div><strong>{emailRatio}%</strong></div>
                  <p>{capabilities.limits.emails.remaining ?? ui("Unlimited", "Illimité")} {ui("emails remain available in this window.", "emails restent disponibles pour cette fenêtre.")}</p>
                </div>
                <div className="usage-facts">
                  <div><span>{ui("Allowed stores", "Boutiques autorisées")}</span><strong>{capabilities.limits.shops ?? "∞"}</strong></div>
                  <div><span>{ui("Available agents", "Agents disponibles")}</span><strong>{activeAgentCount || capabilities.limits.active_agents || "∞"}</strong></div>
                  <div><span>{ui("Quota scope", "Périmètre du quota")}</span><strong>{capabilities.limits.emails.scope || ui("Account", "Compte")}</strong></div>
                  <div><span>{ui("Subscription status", "Statut abonnement")}</span><strong>{capabilities.subscription.status}</strong></div>
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

            {activeView === "messages" && capabilities.features.member_messages ? (
              <MemberMessages language={language} />
            ) : null}

            {activeView === "features" ? (
              <section className="view-enter features-view">
                <div className="section-toolbar"><span>{enabledFeatures.length} {ui("active permissions", "droits actifs")}</span><span>{ui("Source", "Source")} : NeuroCheckout Cloud</span></div>
                <div className="feature-matrix">
                  {enabledFeatures.map(([feature], index) => (
                    <article key={feature}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{displayFeature(feature)}</strong><small>{ui("Available in this installation", "Disponible dans cette installation")}</small></div><i aria-label={ui("Available", "Disponible")}>✓</i></article>
                  ))}
                </div>
                {capabilities.upgrade.available ? <div className="usage-upgrade"><p>{ui("A Cloud plan can activate new permissions without replacing this interface.", "Une offre Cloud peut activer de nouveaux droits sans remplacer cette interface.")}</p>{upgradeAction}</div> : null}
              </section>
            ) : null}

            {activeView === "configuration" ? <div className="view-enter"><CloudConfiguration /></div> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
