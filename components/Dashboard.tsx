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

function displayFeature(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function Dashboard() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
    void load();
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCapabilities(null);
    setStatus("disconnected");
  };

  const emailLimit = capabilities?.limits.emails.limit;
  const emailUsed = capabilities?.limits.emails.used ?? 0;
  const emailRatio = emailLimit ? Math.min(100, Math.round((emailUsed / emailLimit) * 100)) : 0;
  const enabledFeatures = Object.entries(capabilities?.features || {}).filter(([, enabled]) => enabled);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <div><strong>NeuroCheckout</strong><small>Community</small></div>
        </div>
        <nav aria-label="Navigation principale">
          <a className="nav-link active" href="#overview">Vue d’ensemble</a>
          <a className="nav-link" href="#agents">Agents</a>
          <a className="nav-link" href="#usage">Utilisation</a>
          <a className="nav-link" href="#features">Fonctionnalités</a>
          <a className="nav-link" href="#configuration">Configuration</a>
        </nav>
        <div className="boundary-note">
          <span className="status-dot" />
          <div><strong>Interface auto-hébergée</strong><p>La logique métier reste protégée dans le Cloud.</p></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Centre opérationnel</p>
            <h1>Vos agents, votre interface.</h1>
          </div>
          {status === "connected" ? (
            <button className="button secondary" type="button" onClick={logout}>Déconnecter</button>
          ) : null}
        </header>

        {status === "loading" ? (
          <div className="state-panel"><span className="loader" /><p>Synchronisation sécurisée avec NeuroCheckout Cloud…</p></div>
        ) : null}

        {status === "disconnected" || status === "error" ? (
          <section className="connect-panel">
            <p className="eyebrow">Connexion requise</p>
            <h2>Reliez cette instance à votre compte Cloud</h2>
            <p>Vous serez redirigé vers NeuroCheckout Cloud pour confirmer les permissions. Aucun mot de passe n’est saisi ni stocké ici.</p>
            {error ? <p className="error">{error}</p> : null}
            <div className="actions">
              <a className="button primary" href="/api/auth/start">Connecter au Cloud</a>
              {status === "error" ? <button className="button secondary" type="button" onClick={() => void load()}>Réessayer</button> : null}
            </div>
          </section>
        ) : null}

        {capabilities ? (
          <>
            {capabilities.dashboard?.update_required ? (
              <section className="compatibility-alert" role="alert">
                <strong>Mise à jour obligatoire</strong>
                <p>Cette interface ({capabilities.dashboard.current_version || "version inconnue"}) n’est plus compatible. Installez au minimum la version {capabilities.dashboard.minimum_version} avant de continuer.</p>
              </section>
            ) : capabilities.dashboard?.update_recommended ? (
              <section className="compatibility-alert recommended">
                <strong>Mise à jour disponible</strong>
                <p>La version {capabilities.dashboard.latest_version} de NeuroCheckout Community est disponible.</p>
              </section>
            ) : null}
            <section id="overview" className="edition-line">
              <div>
                <p className="eyebrow">Édition active</p>
                <h2>{capabilities.plan.edition === "community" ? "Community" : "Cloud"}</h2>
              </div>
              <div className="edition-meta">
                <span className="status-pill"><span className="status-dot" />{capabilities.subscription.status}</span>
                <span>Contrat API {capabilities.schema_version}</span>
              </div>
            </section>

            <section id="usage" className="metric-grid" aria-label="Limites du compte">
              <article className="metric">
                <p>Boutiques</p>
                <strong>{capabilities.limits.shops ?? "∞"}</strong>
                <small>maximum autorisé</small>
              </article>
              <article className="metric">
                <p>Agents actifs</p>
                <strong>{capabilities.limits.active_agents ?? "∞"}</strong>
                <small>coordination {capabilities.agents.coordination_enabled ? "active" : "inactive"}</small>
              </article>
              <article className="metric wide">
                <div className="metric-heading"><p>Emails · fenêtre glissante</p><strong>{emailUsed} / {emailLimit ?? "∞"}</strong></div>
                <div className="meter" aria-label={`${emailRatio}% du quota email utilisé`}><span style={{ width: `${emailRatio}%` }} /></div>
                <small>{capabilities.limits.emails.remaining ?? "Illimité"} restants · {capabilities.limits.emails.scope || "compte"}</small>
              </article>
            </section>

            <section id="agents" className="content-section">
              <div className="section-heading">
                <div><p className="eyebrow">Orchestration partagée</p><h2>Agents disponibles</h2></div>
                <span>{capabilities.agents.available.length} actifs</span>
              </div>
              <div className="agent-list">
                {capabilities.agents.available.map((agent, index) => (
                  <article key={agent} className="agent-row">
                    <span className="agent-index">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{AGENT_LABELS[agent] || displayFeature(agent)}</h3><p>{agent}</p></div>
                    <span className="live-label">Actif</span>
                  </article>
                ))}
              </div>
            </section>

            <section id="features" className="content-section feature-section">
              <div><p className="eyebrow">Droits calculés par le Cloud</p><h2>Fonctionnalités disponibles</h2></div>
              <ul className="feature-list">
                {enabledFeatures.map(([feature]) => <li key={feature}><span>✓</span>{displayFeature(feature)}</li>)}
              </ul>
            </section>

            <CloudConfiguration />

            {capabilities.upgrade.available ? (
              <section className="upgrade-band">
                <div><p className="eyebrow">Évolutif sans migration</p><h2>Passez au Cloud, gardez cette interface</h2><p>Les nouveaux droits seront activés ici automatiquement après souscription.</p></div>
                <a className="button light" href="/api/upgrade" target="_blank" rel="noreferrer">Voir les offres Cloud</a>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
