"use client";

import type { CSSProperties } from "react";

import type { UiLanguage } from "@/lib/ui-language";

type NetworkAgent = {
  agent_name: string;
  mode: "conversion" | "pilotage";
  attributed_revenue?: number | null;
  assisted_revenue?: number | null;
  impact_value?: number | null;
  impact_unit?: string | null;
};

type AgentNetworkProps = {
  items: NetworkAgent[];
  language: UiLanguage;
  supervisorEnabled: boolean;
  currency?: string | null;
  selectedAgent: string;
  onSelectAgent: (agentName: string) => void;
};

type AgentDefinition = {
  name: string;
  code: string;
  avatar: string;
  index: string;
  left: string;
  top: string;
};

const AGENTS: AgentDefinition[] = [
  { name: "business_alerts_anomalies", code: "B-A-A", avatar: "/agents/aba-avatar.webp", index: "07", left: "19%", top: "19%" },
  { name: "customer_preference_proactive", code: "P-A-D", avatar: "/agents/rpc-avatar.webp", index: "01", left: "50%", top: "24%" },
  { name: "abandoned_cart", code: "A-C-R", avatar: "/agents/pai-avatar.webp", index: "02", left: "80%", top: "20%" },
  { name: "contextual_product_recommendation", code: "P-P-R", avatar: "/agents/rpc-avatar.webp", index: "03", left: "86%", top: "51%" },
  { name: "upsell_cross_sell_dynamic", code: "U-C-D", avatar: "/agents/ucd-avatar.webp", index: "04", left: "73%", top: "75%" },
  { name: "automatic_customer_segmentation", code: "A-C-S", avatar: "/agents/sca-avatar.webp", index: "05", left: "31%", top: "74%" },
  { name: "intelligent_email_marketing", code: "E-M-O", avatar: "/agents/emi-avatar.webp", index: "06", left: "12%", top: "52%" },
];

const PATHS = [
  "M500 304 C420 246 358 184 240 146",
  "M500 304 C500 230 503 122 503 58",
  "M500 304 C608 235 684 158 785 146",
  "M500 304 C627 308 746 296 858 302",
  "M500 304 C592 376 646 434 721 468",
  "M500 304 C417 391 374 445 309 477",
  "M500 304 C376 306 259 311 125 318",
];

const DURATIONS = ["10.8s", "12.4s", "9.6s", "13.2s", "11.4s", "14.8s", "12.9s"];

const LABELS: Record<UiLanguage, Record<string, string>> = {
  en: {
    abandoned_cart: "Abandoned Cart Recovery",
    contextual_product_recommendation: "Personalized Product Recommender",
    intelligent_email_marketing: "Email Marketing Orchestration",
    business_alerts_anomalies: "Business Alerts & Anomalies",
    customer_preference_proactive: "Personalized Product Advisor",
    upsell_cross_sell_dynamic: "Dynamic Upsell / Cross-sell",
    automatic_customer_segmentation: "Automated Customer Segmentation",
  },
  fr: {
    abandoned_cart: "Relance panier abandonné",
    contextual_product_recommendation: "Recommandations personnalisées",
    intelligent_email_marketing: "Orchestration email marketing",
    business_alerts_anomalies: "Alertes et anomalies business",
    customer_preference_proactive: "Conseiller produit personnalisé",
    upsell_cross_sell_dynamic: "Upsell / cross-sell dynamique",
    automatic_customer_segmentation: "Segmentation client automatisée",
  },
};

function formatMetric(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const code = String(currency || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(Number(value));
  }
  return formatMetric(value, 2);
}

export default function AgentNetwork({
  items,
  language,
  supervisorEnabled,
  currency,
  selectedAgent,
  onSelectAgent,
}: AgentNetworkProps) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const indexedItems = new Map(items.map((item) => [item.agent_name, item]));
  const visibleAgents = AGENTS.filter((agent) => indexedItems.has(agent.name));

  return (
    <section className="community-network" aria-label={ui("Coordinated agent network", "Réseau coordonné des agents")}>
      <header className="community-network-header">
        <div>
          <p>{ui("Live orchestration map", "Carte d’orchestration active")}</p>
          <h2>{ui(`Neural network · ${visibleAgents.length} active agents`, `Réseau neuronal · ${visibleAgents.length} agents actifs`)}</h2>
        </div>
        <span className="community-network-status"><i />{ui("Cloud coordinated", "Coordonné par le Cloud")}</span>
      </header>

      <div className="community-network-stage">
        <div className="community-network-stars" aria-hidden="true" />
        <svg className="community-network-web" aria-hidden="true" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <defs>
            <radialGradient id="community-core-glow">
              <stop offset="0" stopColor="#5ed9ff" stopOpacity=".82" />
              <stop offset=".35" stopColor="#2877f3" stopOpacity=".42" />
              <stop offset="1" stopColor="#2877f3" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="community-path-blue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#246ef0" stopOpacity=".16" />
              <stop offset=".52" stopColor="#3bc8ff" stopOpacity=".86" />
              <stop offset="1" stopColor="#2877f3" stopOpacity=".15" />
            </linearGradient>
          </defs>
          <circle cx="500" cy="304" r="182" fill="url(#community-core-glow)" opacity=".42" />
          <circle className="community-network-orbit" cx="500" cy="304" r="126" />
          <circle className="community-network-orbit orbit-secondary" cx="500" cy="304" r="190" />
          {PATHS.map((path, index) => (
            <g key={path}>
              <path className="community-network-path path-shadow" d={path} />
              <path className="community-network-path" d={path} pathLength="1" />
              <circle className="community-network-flow-dot" r="4.4" fill={index === 4 ? "#44e3a9" : index === 5 ? "#ffd15b" : "#61d7ff"}>
                <animateMotion dur={DURATIONS[index]} repeatCount="indefinite" path={path} />
              </circle>
            </g>
          ))}
        </svg>

        {supervisorEnabled ? (
          <div className="community-supervisor-core">
            <span>S</span>
            <strong>Supervisor</strong>
            <small>{ui("Central coordinator", "Coordinateur central")}</small>
          </div>
        ) : null}

        {visibleAgents.map((agent) => {
          const item = indexedItems.get(agent.name)!;
          return (
            <button
              className={`community-agent-node${selectedAgent === agent.name ? " selected" : ""}`}
              key={agent.name}
              style={{ "--agent-left": agent.left, "--agent-top": agent.top } as CSSProperties}
              type="button"
              onClick={() => onSelectAgent(agent.name)}
              aria-pressed={selectedAgent === agent.name}
            >
              <span className="community-agent-avatar">
                <img src={agent.avatar} alt="" width="54" height="54" />
                <i>{agent.index}</i>
              </span>
              <span className="community-agent-copy">
                <strong>{agent.code}</strong>
                <small>{LABELS[language][agent.name]}</small>
                <em><i />{ui("Active", "Actif")}</em>
              </span>
              {item.mode === "conversion" ? (
                <span className="community-agent-impact">
                  <small>{ui("Revenue impact", "Impact revenu")}</small>
                  <strong>{formatMoney(item.attributed_revenue ?? item.assisted_revenue, currency)}</strong>
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="community-network-legend" aria-label={ui("Decision flow", "Flux de décision")}>
          <span><i className="collect" />{ui("Collect", "Collecte")}</span>
          <span><i className="analyze" />{ui("Analyze", "Analyse")}</span>
          <span><i className="decide" />{ui("Decision", "Décision")}</span>
          <span><i className="act" />{ui("Action", "Action")}</span>
          <span><i className="convert" />{ui("Conversion", "Conversion")}</span>
        </div>
      </div>
    </section>
  );
}
