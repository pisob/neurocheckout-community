import type { UiLanguage } from "@/lib/ui-language";

type LocalizedCopy = Record<UiLanguage, string>;

const PUBLIC_ERROR_COPY: Record<string, LocalizedCopy> = {
  community_not_connected: {
    en: "Reconnect this installation to continue.",
    fr: "Reconnectez cette installation pour continuer.",
  },
  community_scope_required: {
    en: "Reconnect this installation once to authorize this action.",
    fr: "Reconnectez cette installation une fois pour autoriser cette action.",
  },
  cloud_unavailable: {
    en: "The NeuroCheckout service is temporarily unavailable.",
    fr: "Le service NeuroCheckout est temporairement indisponible.",
  },
  cloud_response_invalid: {
    en: "The service returned an unexpected response. Please try again.",
    fr: "Le service a renvoyé une réponse inattendue. Veuillez réessayer.",
  },
};

const PUBLIC_FEATURE_COPY: Record<string, LocalizedCopy> = {
  member_dashboard: { en: "Member dashboard", fr: "Tableau de bord membre" },
  core_agents: { en: "AI agents", fr: "Agents IA" },
  connector_sync: { en: "Connector synchronization", fr: "Synchronisation du connecteur" },
  template_customization: { en: "Email customization", fr: "Personnalisation des emails" },
  llm_byok: { en: "Encrypted AI key", fr: "Clé IA chiffrée" },
  email_approvals: { en: "Email approvals", fr: "Validation des emails" },
  member_messages: { en: "Account messages", fr: "Messages du compte" },
  agent_performance: { en: "Performance reports", fr: "Rapports de performance" },
  converted_orders: { en: "Attributed orders", fr: "Commandes attribuées" },
  recent_emails: { en: "Recent emails", fr: "Emails récents" },
  optimization_recommendations: { en: "Optimization recommendations", fr: "Recommandations d’optimisation" },
  supervisor_automation: { en: "Automatic recommendations", fr: "Recommandations automatiques" },
  journey_audit: { en: "Customer journey audit", fr: "Audit du parcours client" },
  sync_health: { en: "Synchronization health", fr: "État de la synchronisation" },
  member_profile: { en: "Member profile", fr: "Profil membre" },
  partner_program: { en: "Partner program", fr: "Programme partenaire" },
  advanced_analytics: { en: "Advanced analytics", fr: "Analyses avancées" },
  hosted_dashboard: { en: "Hosted dashboard", fr: "Tableau de bord hébergé" },
};

const PUBLIC_AGENT_COPY: Record<string, LocalizedCopy> = {
  abandoned_cart: { en: "Abandoned cart recovery", fr: "Relance panier abandonné" },
  contextual_product_recommendation: { en: "Personalized recommendations", fr: "Recommandations personnalisées" },
  intelligent_email_marketing: { en: "Email campaigns", fr: "Campagnes email" },
  business_alerts_anomalies: { en: "Business alerts", fr: "Alertes business" },
  customer_preference_proactive: { en: "Product advisor", fr: "Conseiller produit" },
  upsell_cross_sell_dynamic: { en: "Upsell and cross-sell", fr: "Upsell et cross-sell" },
  automatic_customer_segmentation: { en: "Customer segmentation", fr: "Segmentation client" },
  contextual_support_order_aware: { en: "Customer support", fr: "Support client" },
  agent_supervisor: { en: "Service coordination", fr: "Coordination du service" },
};

const PUBLIC_ENUM_COPY: Record<string, LocalizedCopy> = {
  active: { en: "Active", fr: "Actif" },
  inactive: { en: "Inactive", fr: "Inactif" },
  free_active: { en: "Community active", fr: "Community actif" },
  trial_active: { en: "Trial active", fr: "Essai actif" },
  paid_active: { en: "Subscription active", fr: "Abonnement actif" },
  payment_failed_grace: { en: "Payment action required", fr: "Action de paiement requise" },
  suspended: { en: "Subscription suspended", fr: "Abonnement suspendu" },
  expired: { en: "Subscription expired", fr: "Abonnement expiré" },
  cancelled: { en: "Subscription cancelled", fr: "Abonnement annulé" },
  pending: { en: "Pending", fr: "En attente" },
  processing: { en: "Processing", fr: "En cours" },
  retrying: { en: "Retrying", fr: "Nouvelle tentative" },
  failed: { en: "Failed", fr: "Échec" },
  ready: { en: "Ready", fr: "Prêt" },
  sent: { en: "Sent", fr: "Envoyé" },
  delivered: { en: "Delivered", fr: "Livré" },
  opened: { en: "Opened", fr: "Ouvert" },
  clicked: { en: "Clicked", fr: "Cliqué" },
  converted: { en: "Converted", fr: "Converti" },
  bounced: { en: "Bounced", fr: "Rejeté" },
  collecting_events: { en: "Collecting activity", fr: "Collecte de l’activité" },
  audits_available: { en: "Audit available", fr: "Audit disponible" },
  checkout_abandoned_signal: { en: "Checkout awaiting completion", fr: "Commande en attente de finalisation" },
  abandoned_cart: { en: "Cart awaiting completion", fr: "Panier en attente de finalisation" },
  checkout_started: { en: "Checkout started", fr: "Commande commencée" },
  cart_snapshot: { en: "Cart updated", fr: "Panier actualisé" },
  product_view: { en: "Product viewed", fr: "Produit consulté" },
  order_completed: { en: "Order completed", fr: "Commande finalisée" },
  high: { en: "High", fr: "Haute" },
  medium: { en: "Medium", fr: "Moyenne" },
  low: { en: "Low", fr: "Faible" },
  estimated: { en: "Estimated", fr: "Estimée" },
  influenced: { en: "Influenced", fr: "Influencée" },
  confirmed: { en: "Confirmed", fr: "Confirmée" },
  actionable_coverage_rate: { en: "Actionable coverage", fr: "Couverture exploitable" },
  actionable_segmented_customers: { en: "Customers segmented", fr: "Clients segmentés" },
  approval_rate: { en: "Approval rate", fr: "Taux d’approbation" },
  resolved_cases: { en: "Cases resolved", fr: "Demandes résolues" },
  business_impact_avg_score: { en: "Average business impact", fr: "Impact business moyen" },
  noise_suppression_rate: { en: "Alert relevance", fr: "Pertinence des alertes" },
};

export function publicErrorMessage(
  detail: unknown,
  fallback: LocalizedCopy,
  language: UiLanguage,
): string {
  const code = typeof detail === "string" ? detail.trim().toLowerCase() : "";
  return PUBLIC_ERROR_COPY[code]?.[language] || fallback[language];
}

export function publicFeatureLabel(feature: string, language: UiLanguage): string | null {
  return PUBLIC_FEATURE_COPY[feature]?.[language] || null;
}

export function publicAgentLabel(agent: unknown, language: UiLanguage): string {
  const key = typeof agent === "string" ? agent.trim().toLowerCase() : "";
  return PUBLIC_AGENT_COPY[key]?.[language]
    || (language === "fr" ? "Agent NeuroCheckout" : "NeuroCheckout agent");
}

export function publicEnumLabel(value: unknown, language: UiLanguage, fallback = "—"): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const key = raw.includes(".") ? raw.split(".").at(-1) || "" : raw;
  return PUBLIC_ENUM_COPY[key]?.[language] || fallback;
}
