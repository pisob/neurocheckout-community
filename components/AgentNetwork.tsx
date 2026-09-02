"use client";

import type { CSSProperties } from "react";

import { agentAvatar } from "@/lib/agent-visuals";
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
  index: string;
  left: string;
  top: string;
};

const AGENTS: AgentDefinition[] = [
  { name: "business_alerts_anomalies", code: "B-A-A", index: "07", left: "57%", top: "17.5%" },
  { name: "customer_preference_proactive", code: "P-A-D", index: "01", left: "80%", top: "17.5%" },
  { name: "abandoned_cart", code: "A-C-R", index: "02", left: "57%", top: "43.5%" },
  { name: "contextual_product_recommendation", code: "P-P-R", index: "03", left: "80%", top: "43.5%" },
  { name: "upsell_cross_sell_dynamic", code: "U-C-D", index: "04", left: "57%", top: "69.5%" },
  { name: "automatic_customer_segmentation", code: "A-C-S", index: "05", left: "80%", top: "69.5%" },
  { name: "intelligent_email_marketing", code: "E-M-O", index: "06", left: "68.5%", top: "87%" },
];

const PATHS = [
  "M240 300 C352 300 388 105 570 105",
  "M240 300 C388 300 520 105 800 105",
  "M240 300 C365 300 410 260 570 260",
  "M240 300 C410 300 554 260 800 260",
  "M240 300 C365 300 410 415 570 415",
  "M240 300 C410 300 554 415 800 415",
  "M240 300 C405 300 475 522 685 522",
];

const DURATIONS = ["32s", "37s", "29s", "35s", "38s", "33s", "36s"];
const RETURN_PATHS = [
  "M570 105 C388 105 352 300 240 300",
  "M800 105 C520 105 388 300 240 300",
  "M570 260 C410 260 365 300 240 300",
  "M800 260 C554 260 410 300 240 300",
  "M570 415 C410 415 365 300 240 300",
  "M800 415 C554 415 410 300 240 300",
  "M685 522 C475 522 405 300 240 300",
];
const RETURN_DURATIONS = ["38s", "34s", "40s", "37s", "35s", "41s", "39s"];

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
          <h2>{ui(`Neural coordination · ${visibleAgents.length} active agents`, `Coordination neuronale · ${visibleAgents.length} agents actifs`)}</h2>
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
          <circle cx="240" cy="300" r="190" fill="url(#community-core-glow)" opacity=".32" />
          <path className="community-network-spine" d="M430 72 L430 528" />
          {[105, 260, 415, 522].map((cy) => <circle className="community-network-spine-node" cx="430" cy={cy} key={cy} r="3.5" />)}
          {PATHS.map((path, index) => (
            <g key={path}>
              <path className="community-network-path path-shadow" d={path} />
              <path className="community-network-path" d={path} pathLength="1" />
              <circle className="community-network-flow-dot" r="4.4" fill={index === 4 ? "#44e3a9" : index === 5 ? "#ffd15b" : "#61d7ff"}>
                <animateMotion begin={`${index * -4.7}s`} dur={DURATIONS[index]} repeatCount="indefinite" path={path} />
              </circle>
              <circle className="community-network-flow-dot return-signal" r="3.2" fill="#9ccfff">
                <animate attributeName="opacity" dur={RETURN_DURATIONS[index]} keyTimes="0;0.16;0.78;1" repeatCount="indefinite" values="0;0.58;0.58;0" />
                <animateMotion begin={`${-8 - index * 3.9}s`} dur={RETURN_DURATIONS[index]} repeatCount="indefinite" path={RETURN_PATHS[index]} />
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
                <img src={agentAvatar(agent.name)} alt="" width="54" height="54" />
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
