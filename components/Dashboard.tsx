"use client";

import { useEffect, useState } from "react";
import CloudConfiguration from "@/components/CloudConfiguration";

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
  agents: { available: string[]; coordination_enabled: boolean };
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

type DashboardView = "overview" | "agents" | "usage" | "features" | "configuration";

const VIEW_COPY: Record<DashboardView, { label: string; eyebrow: string; title: string; description: string }> = {
  overview: {
    label: "Vue d’ensemble",
    eyebrow: "Centre opérationnel",
    title: "État de votre installation",
    description: "Quotas, agents et accès Cloud réunis dans une vue de contrôle.",
  },
  agents: {
    label: "Agents",
    eyebrow: "Orchestration partagée",
    title: "Agents disponibles",
    description: "Les rôles actifs coopèrent dans le Cloud pour fiabiliser chaque décision.",
  },
  usage: {
    label: "Utilisation",
    eyebrow: "Capacité Community",
    title: "Quotas et consommation",
    description: "Suivez la fenêtre email et les limites appliquées par votre offre.",
  },
  features: {
    label: "Fonctionnalités",
    eyebrow: "Droits calculés par le Cloud",
    title: "Fonctionnalités disponibles",
    description: "Les accès sont recalculés côté serveur à chaque changement d’offre.",
  },
  configuration: {
    label: "Configuration",
    eyebrow: "Personnalisation contrôlée",
    title: "Boutique, emails et connecteur",
    description: "Configurez uniquement l’outil dont vous avez besoin, sans parcourir une longue page.",
  },
};

const AGENT_LABELS: Record<string, string> = {
  customer_preference_proactive: "Conseiller produit proactif",
  abandoned_cart: "Relance panier abandonné",
  contextual_product_recommendation: "Recommandations personnalisées",
  intelligent_email_marketing: "Orchestration email",
  upsell_cross_sell_dynamic: "Upsell et cross-sell",
  automatic_customer_segmentation: "Segmentation client",
  contextual_support_order_aware: "Support contextuel",
  business_alerts_anomalies: "Alertes business",
};

const AGENT_ROLES: Record<string, string> = {
  customer_preference_proactive: "Préférence",
  abandoned_cart: "Conversion",
  contextual_product_recommendation: "Recommandation",
  intelligent_email_marketing: "Communication",
  upsell_cross_sell_dynamic: "Revenu",
  automatic_customer_segmentation: "Audience",
  contextual_support_order_aware: "Support",
  business_alerts_anomalies: "Surveillance",
};

function displayFeature(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function viewFromHash(): DashboardView {
  if (typeof window === "undefined") return "overview";
  const candidate = window.location.hash.replace("#", "") as DashboardView;
  return candidate in VIEW_COPY ? candidate : "overview";
}

export default function Dashboard() {
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
      if (!response.ok) throw new Error(payload.detail || "Cloud indisponible");
      setCapabilities(payload);
      setStatus("connected");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Cloud indisponible");
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
  const viewCopy = VIEW_COPY[activeView];

  const upgradeAction = capabilities?.upgrade.available ? (
    <a className="button secondary-blue" href="/api/upgrade" target="_blank" rel="noreferrer">
      Comparer les offres
    </a>
  ) : null;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>NeuroCheckout</strong><small>Community</small></div>
        </div>

        <nav aria-label="Navigation principale">
          {(Object.keys(VIEW_COPY) as DashboardView[]).map((view, index) => (
            <button
              className={`nav-link${activeView === view ? " active" : ""}`}
              key={view}
              type="button"
              onClick={() => selectView(view)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {VIEW_COPY[view].label}
            </button>
          ))}
        </nav>

        <div className="boundary-note">
          <span className="status-dot" />
          <div><strong>Interface auto-hébergée</strong><p>Logique métier et décisions sécurisées dans NeuroCheckout Cloud.</p></div>
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
            {capabilities ? (
              <span className="cloud-status"><span className="status-dot" />Cloud synchronisé</span>
            ) : null}
            {status === "connected" ? (
              <button className="button ghost" type="button" onClick={logout}>Déconnecter</button>
            ) : null}
          </div>
        </header>

        {status === "loading" ? (
          <div className="state-panel"><span className="loader" /><p>Synchronisation sécurisée avec NeuroCheckout Cloud…</p></div>
        ) : null}

        {status === "disconnected" || status === "error" ? (
          <section className="connect-panel view-enter">
            <p className="eyebrow">Connexion requise</p>
            <h2>Reliez cette instance à votre compte Cloud</h2>
            <p>Confirmez les permissions dans NeuroCheckout Cloud. Aucun mot de passe n’est saisi ni stocké dans Community.</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="actions">
              <a className="button primary" href="/api/auth/start">Connecter au Cloud</a>
              {status === "error" ? <button className="button ghost" type="button" onClick={() => void load()}>Réessayer</button> : null}
            </div>
          </section>
        ) : null}

        {capabilities ? (
          <>
            {capabilities.dashboard?.update_required ? (
              <section className="compatibility-alert" role="alert">
                <strong>Mise à jour obligatoire</strong>
                <p>Cette interface ({capabilities.dashboard.current_version || "version inconnue"}) doit être mise à jour vers la version {capabilities.dashboard.minimum_version} minimum.</p>
              </section>
            ) : capabilities.dashboard?.update_recommended ? (
              <section className="compatibility-alert recommended">
                <strong>Mise à jour disponible</strong>
                <p>La version {capabilities.dashboard.latest_version} de NeuroCheckout Community est disponible.</p>
              </section>
            ) : null}

            {activeView === "overview" ? (
              <div className="view-enter overview-view">
                <section className="command-surface">
                  <div className="edition-summary">
                    <p className="eyebrow">Édition active</p>
                    <div className="edition-title">
                      <h2>{capabilities.plan.edition === "community" ? "Community" : "Cloud"}</h2>
                      <span className="status-pill"><span className="status-dot" />{capabilities.subscription.status}</span>
                    </div>
                    <p>Contrat API {capabilities.schema_version} · droits recalculés côté serveur</p>
                  </div>
                  <div className="metric-rail" aria-label="Limites du compte">
                    <article className="metric">
                      <p>Boutiques</p>
                      <strong>{capabilities.limits.shops ?? "∞"}</strong>
                      <small>maximum</small>
                    </article>
                    <article className="metric">
                      <p>Agents</p>
                      <strong>{capabilities.limits.active_agents ?? "∞"}</strong>
                      <small>{capabilities.agents.coordination_enabled ? "coordonnés" : "individuels"}</small>
                    </article>
                    <article className="metric quota-metric">
                      <div><p>Emails</p><strong>{emailUsed}<em>/ {emailLimit ?? "∞"}</em></strong></div>
                      <div className="meter" aria-label={`${emailRatio}% du quota email utilisé`}><span style={{ width: `${emailRatio}%` }} /></div>
                      <small>{capabilities.limits.emails.remaining ?? "Illimité"} disponibles</small>
                    </article>
                  </div>
                </section>

                <div className="overview-columns">
                  <section className="workspace-panel">
                    <div className="panel-heading"><div><p className="eyebrow">Orchestration</p><h2>Réseau d’agents</h2></div><button type="button" onClick={() => selectView("agents")}>Voir les {capabilities.agents.available.length}</button></div>
                    <div className="agent-preview-grid">
                      {capabilities.agents.available.slice(0, 4).map((agent, index) => (
                        <article key={agent} className="agent-preview">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div><strong>{AGENT_LABELS[agent] || displayFeature(agent)}</strong><small>{AGENT_ROLES[agent] || "Agent"}</small></div>
                          <i aria-label="Actif" />
                        </article>
                      ))}
                    </div>
                  </section>

                  <aside className="action-panel">
                    <p className="eyebrow">Accès rapide</p>
                    <h2>Continuer la configuration</h2>
                    <p>Gérez la boutique, les emails, votre clé IA ou le connecteur depuis un espace dédié.</p>
                    <button className="button primary" type="button" onClick={() => selectView("configuration")}>Ouvrir la configuration</button>
                    <div className="feature-count"><strong>{enabledFeatures.length}</strong><span>fonctionnalités actives</span></div>
                  </aside>
                </div>

                {capabilities.upgrade.available ? (
                  <section className="upgrade-line"><div><strong>Besoin de plus de capacité ?</strong><span>Gardez cette interface et activez les droits Cloud sans migration.</span></div>{upgradeAction}</section>
                ) : null}
              </div>
            ) : null}

            {activeView === "agents" ? (
              <section className="view-enter agents-view">
                <div className="section-toolbar"><span>{capabilities.agents.available.length} agents actifs</span><span>Coordination {capabilities.agents.coordination_enabled ? "active" : "inactive"}</span></div>
                <div className="agent-matrix">
                  {capabilities.agents.available.map((agent, index) => (
                    <article key={agent} className="agent-cell">
                      <div className="agent-cell-top"><span>{String(index + 1).padStart(2, "0")}</span><i aria-label="Actif" /></div>
                      <h2>{AGENT_LABELS[agent] || displayFeature(agent)}</h2>
                      <p>{AGENT_ROLES[agent] || "Agent spécialisé"}</p>
                      <code>{agent}</code>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeView === "usage" ? (
              <section className="view-enter usage-view">
                <div className="usage-primary">
                  <div className="usage-number"><span>Emails utilisés</span><strong>{emailUsed}</strong><small>sur {emailLimit ?? "∞"} · fenêtre glissante</small></div>
                  <div className="usage-meter"><div className="meter"><span style={{ width: `${emailRatio}%` }} /></div><strong>{emailRatio}%</strong></div>
                  <p>{capabilities.limits.emails.remaining ?? "Illimité"} emails restent disponibles pour cette fenêtre.</p>
                </div>
                <div className="usage-facts">
                  <div><span>Boutiques autorisées</span><strong>{capabilities.limits.shops ?? "∞"}</strong></div>
                  <div><span>Agents disponibles</span><strong>{capabilities.limits.active_agents ?? "∞"}</strong></div>
                  <div><span>Périmètre du quota</span><strong>{capabilities.limits.emails.scope || "Compte"}</strong></div>
                  <div><span>Statut abonnement</span><strong>{capabilities.subscription.status}</strong></div>
                </div>
                {capabilities.upgrade.available ? <div className="usage-upgrade"><p>Les limites supérieures sont activées automatiquement après souscription.</p>{upgradeAction}</div> : null}
              </section>
            ) : null}

            {activeView === "features" ? (
              <section className="view-enter features-view">
                <div className="section-toolbar"><span>{enabledFeatures.length} droits actifs</span><span>Source : NeuroCheckout Cloud</span></div>
                <div className="feature-matrix">
                  {enabledFeatures.map(([feature], index) => (
                    <article key={feature}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{displayFeature(feature)}</strong><small>Disponible dans cette installation</small></div><i aria-label="Disponible">✓</i></article>
                  ))}
                </div>
                {capabilities.upgrade.available ? <div className="usage-upgrade"><p>Une offre Cloud peut activer de nouveaux droits sans remplacer cette interface.</p>{upgradeAction}</div> : null}
              </section>
            ) : null}

            {activeView === "configuration" ? <div className="view-enter"><CloudConfiguration /></div> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
