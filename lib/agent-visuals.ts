export const SUPERVISOR_AVATAR = "/branding/neurocheckout-logo-300.png";

const AGENT_AVATARS: Record<string, string> = {
  business_alerts_anomalies: "/agents/aba-avatar.webp",
  customer_preference_proactive: "/agents/rpc-avatar.webp",
  abandoned_cart: "/agents/pai-avatar.webp",
  contextual_product_recommendation: "/agents/rpc-avatar.webp",
  upsell_cross_sell_dynamic: "/agents/ucd-avatar.webp",
  automatic_customer_segmentation: "/agents/sca-avatar.webp",
  intelligent_email_marketing: "/agents/emi-avatar.webp",
};

export function agentAvatar(agentName: string): string {
  return agentName === "agent_supervisor"
    ? SUPERVISOR_AVATAR
    : AGENT_AVATARS[agentName] || SUPERVISOR_AVATAR;
}
