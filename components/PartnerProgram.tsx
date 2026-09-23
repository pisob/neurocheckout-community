"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "@/lib/ui-language";

type MoneyRow = {
  amount_cents?: number;
  currency?: string;
  status?: string;
  requested_at?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

type ReferredSite = {
  shop_id?: string;
  display_name?: string;
  shop_base_url?: string;
  platform?: string;
  is_active?: boolean;
  referral_status?: string;
  registered_at?: string | null;
  converted_at?: string | null;
  referred_at?: string | null;
};

type PartnerPayload = {
  exists?: boolean;
  program_settings?: {
    default_commission_rate_bps?: number;
    default_commission_months?: number;
  };
  affiliate?: {
    code?: string;
    referral_url?: string;
    status?: string;
    code_status?: string;
    commission_rate_bps?: number;
    commission_months?: number;
    full_name?: string;
    stripe_onboarding_status?: string;
    stripe_payouts_enabled?: boolean;
    stripe_details_submitted?: boolean;
  };
  stats?: {
    clicks_30d?: number;
    clicks_total?: number;
    referrals_total?: number;
    converted_total?: number;
    pending_cents?: number;
    approved_cents?: number;
    paid_cents?: number;
    available_payout_cents?: number;
  };
  payout_minimum_cents?: number;
  referred_sites?: ReferredSite[];
  referred_sites_page?: number;
  referred_sites_total?: number;
  referred_sites_total_pages?: number;
  recent_payouts?: MoneyRow[];
  recent_payout_requests?: MoneyRow[];
  open_payout_request?: MoneyRow | null;
  detail?: string;
};

const COPY = {
  en: {
    loading: "Loading your partner workspace…",
    loadError: "Partner data is temporarily unavailable.",
    reconnect: "Reconnect this installation to authorize partner access.",
    reconnectAction: "Reconnect securely",
    retry: "Retry",
    noAccount: "Join the partner program",
    noAccountBody: "Submit your application from this verified account. Cloud reviews the application and keeps attribution and payouts authoritative.",
    terms: "The current program offers {rate}% recurring commission for {months} months.",
    fullName: "Full name",
    company: "Company",
    website: "Website",
    profile: "Profile",
    promotion: "How will you recommend NeuroCheckout?",
    code: "Requested code",
    apply: "Submit application",
    applying: "Submitting…",
    applicationSent: "Application submitted. Its status is now available here.",
    applicationError: "The application could not be submitted.",
    control: "Partner control center",
    controlBody: "Track your referral link, attributed customers, commissions and payouts.",
    status: "Status",
    commission: "Commission",
    period: "Commission period",
    months: "months",
    referralLink: "Referral link",
    copy: "Copy link",
    copied: "Link copied",
    unavailableLink: "The link becomes available after Cloud approves the application.",
    clicks30: "Clicks · 30 days",
    clicksTotal: "All clicks",
    referrals: "Referrals",
    converted: "Converted customers",
    financial: "Commission evidence",
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    available: "Available payout",
    stripeTitle: "Payout account",
    stripeReady: "Stripe is ready to receive approved payouts.",
    stripeNeeded: "Connect Stripe securely before requesting a payout.",
    connectStripe: "Connect Stripe",
    connecting: "Opening Stripe…",
    stripeReturned: "Stripe onboarding returned. The payout status has been refreshed.",
    stripeRefreshing: "Refreshing the secure Stripe onboarding link…",
    requestPayout: "Request payout",
    requesting: "Submitting…",
    threshold: "Minimum payout: {amount}",
    openRequest: "A payout request is already being reviewed.",
    payoutSent: "Payout request submitted for review.",
    actionError: "The action could not be completed.",
    sites: "Referred sites",
    sitesBody: "Stores linked to accounts acquired through your referral link. Customer contact details are not displayed.",
    search: "Search by store or URL",
    platform: "All platforms",
    referralState: "All attribution states",
    filter: "Filter",
    clear: "Clear",
    noSites: "No referred store matches these filters.",
    store: "Store",
    attribution: "Attribution",
    date: "Date",
    previous: "Previous",
    next: "Next",
    recentRequests: "Recent payout requests",
    recentPayouts: "Recent payouts",
    noHistory: "No activity yet.",
  },
  fr: {
    loading: "Chargement de votre espace partenaire…",
    loadError: "Les données partenaires sont temporairement indisponibles.",
    reconnect: "Reconnectez cette installation pour autoriser l’accès partenaire.",
    reconnectAction: "Reconnecter en sécurité",
    retry: "Réessayer",
    noAccount: "Rejoindre le programme partenaire",
    noAccountBody: "Envoyez votre candidature depuis ce compte vérifié. Le Cloud contrôle la validation, l’attribution et les paiements.",
    terms: "Le programme actuel prévoit {rate}% de commission récurrente pendant {months} mois.",
    fullName: "Nom complet",
    company: "Société",
    website: "Site web",
    profile: "Profil",
    promotion: "Comment recommanderez-vous NeuroCheckout ?",
    code: "Code souhaité",
    apply: "Envoyer la candidature",
    applying: "Envoi…",
    applicationSent: "Candidature envoyée. Son statut est désormais disponible ici.",
    applicationError: "La candidature n’a pas pu être envoyée.",
    control: "Centre de contrôle partenaire",
    controlBody: "Suivez votre lien, les clients attribués, les commissions et les paiements.",
    status: "Statut",
    commission: "Commission",
    period: "Durée de commission",
    months: "mois",
    referralLink: "Lien de recommandation",
    copy: "Copier le lien",
    copied: "Lien copié",
    unavailableLink: "Le lien sera disponible après validation de la candidature par le Cloud.",
    clicks30: "Clics · 30 jours",
    clicksTotal: "Tous les clics",
    referrals: "Références",
    converted: "Clients convertis",
    financial: "Preuves de commission",
    pending: "En attente",
    approved: "Validées",
    paid: "Payées",
    available: "Solde demandable",
    stripeTitle: "Compte de paiement",
    stripeReady: "Stripe est prêt à recevoir les paiements validés.",
    stripeNeeded: "Connectez Stripe en sécurité avant de demander un paiement.",
    connectStripe: "Connecter Stripe",
    connecting: "Ouverture de Stripe…",
    stripeReturned: "Retour de Stripe effectué. L’état du compte de paiement a été actualisé.",
    stripeRefreshing: "Renouvellement du lien sécurisé Stripe…",
    requestPayout: "Demander un paiement",
    requesting: "Envoi…",
    threshold: "Seuil minimum : {amount}",
    openRequest: "Une demande de paiement est déjà en cours de vérification.",
    payoutSent: "Demande de paiement envoyée pour vérification.",
    actionError: "L’action n’a pas pu être effectuée.",
    sites: "Sites parrainés",
    sitesBody: "Boutiques rattachées aux comptes acquis avec votre lien. Les coordonnées des clients ne sont jamais affichées.",
    search: "Rechercher une boutique ou une URL",
    platform: "Toutes les plateformes",
    referralState: "Tous les états d’attribution",
    filter: "Filtrer",
    clear: "Effacer",
    noSites: "Aucune boutique parrainée ne correspond à ces filtres.",
    store: "Boutique",
    attribution: "Attribution",
    date: "Date",
    previous: "Précédent",
    next: "Suivant",
    recentRequests: "Demandes de paiement récentes",
    recentPayouts: "Paiements récents",
    noHistory: "Aucune activité pour le moment.",
  },
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(cents: unknown, currency: unknown, language: UiLanguage) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
  }).format(number(cents) / 100);
}

function date(value: unknown, language: UiLanguage) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(language === "fr" ? "fr-FR" : "en-US");
}

function displaySite(site: ReferredSite) {
  return site.display_name || site.shop_id || site.shop_base_url || "—";
}

const STATUS_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: {
    active: "Active", pending: "Under review", approved: "Approved", requested: "Requested",
    paid: "Paid", rejected: "Rejected", suspended: "Suspended", registered: "Registered",
    converted: "Converted", cancelled: "Cancelled", failed: "Failed",
  },
  fr: {
    active: "Actif", pending: "En attente", approved: "Validée", requested: "Demandée",
    paid: "Payée", rejected: "Refusée", suspended: "Suspendu", registered: "Inscrite",
    converted: "Convertie", cancelled: "Annulée", failed: "Échec",
  },
};

function statusLabel(value: unknown, language: UiLanguage) {
  const normalized = String(value || "").trim().toLowerCase();
  return STATUS_LABELS[language][normalized] || normalized || "—";
}

export default function PartnerProgram({ language }: { language: UiLanguage }) {
  const copy = COPY[language];
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const [referralStatus, setReferralStatus] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      referred_sites_page: String(page),
      referred_sites_per_page: "10",
    });
    if (query) params.set("referred_sites_q", query);
    if (platform) params.set("referred_sites_platform", platform);
    if (referralStatus) params.set("referred_sites_referral_status", referralStatus);
    const response = await fetch(`/api/cloud/partner?${params}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as PartnerPayload;
    if (!response.ok) throw new Error(String(payload.detail || "partner_unavailable"));
    setData(payload);
    setError("");
  }, [page, platform, query, referralStatus]);

  useEffect(() => {
    let cancelled = false;
    load().catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "partner_unavailable");
    });
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const action = currentUrl.searchParams.get("partner");
    if (action !== "stripe-return" && action !== "stripe-refresh") return;

    currentUrl.searchParams.delete("partner");
    window.history.replaceState(
      {},
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash || "#partner-program"}`,
    );
    if (action === "stripe-return") {
      setNotice(copy.stripeReturned);
      return;
    }

    setBusy("stripe");
    setNotice(copy.stripeRefreshing);
    void fetch("/api/cloud/partner/stripe-connect", { method: "POST" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { url?: string };
        if (!response.ok || !payload.url) throw new Error();
        window.location.assign(payload.url);
      })
      .catch(() => {
        setNotice("");
        setError(copy.actionError);
        setBusy("");
      });
  }, [copy.actionError, copy.stripeRefreshing, copy.stripeReturned]);

  const referralLink = useMemo(() => {
    const url = String(data?.affiliate?.referral_url || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }, [data?.affiliate?.referral_url]);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("apply");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/cloud/partner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      setNotice(copy.applicationSent);
      await load();
    } catch {
      setError(copy.applicationError);
    } finally {
      setBusy("");
    }
  }

  async function connectStripe() {
    setBusy("stripe");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cloud/partner/stripe-connect", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { url?: string };
      if (!response.ok || !payload.url) throw new Error();
      window.location.assign(payload.url);
    } catch {
      setError(copy.actionError);
      setBusy("");
    }
  }

  async function requestPayout() {
    setBusy("payout");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cloud/partner/payout-request", { method: "POST" });
      if (!response.ok) throw new Error();
      setNotice(copy.payoutSent);
      await load();
    } catch {
      setError(copy.actionError);
    } finally {
      setBusy("");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setNotice(copy.copied);
    } catch {
      setError(copy.actionError);
    }
  }

  if (!data && !error) {
    return <section className="operational-state view-enter"><span className="loader" /><p>{copy.loading}</p></section>;
  }

  if (error && !data) {
    const scopeMissing = error === "community_scope_required";
    return (
      <section className="operational-state view-enter">
        <p className="eyebrow">{copy.status}</p>
        <h2>{scopeMissing ? copy.reconnect : copy.loadError}</h2>
        <div className="actions">
          {scopeMissing ? <a className="button primary" href="/api/auth/start">{copy.reconnectAction}</a> : null}
          <button className="button ghost" type="button" onClick={() => void load()}>{copy.retry}</button>
        </div>
      </section>
    );
  }

  const programRate = number(data?.program_settings?.default_commission_rate_bps) / 100;
  const programMonths = number(data?.program_settings?.default_commission_months) || 12;

  if (!data?.exists) {
    return (
      <section className="partner-view view-enter">
        <div className="partner-intro">
          <div><p className="eyebrow">{copy.noAccount}</p><h2>{copy.noAccount}</h2><p>{copy.noAccountBody}</p></div>
          <strong>{copy.terms.replace("{rate}", String(programRate || 25)).replace("{months}", String(programMonths))}</strong>
        </div>
        {error ? <p className="config-error">{error}</p> : null}
        {notice ? <p className="config-notice">{notice}</p> : null}
        <form className="partner-application" onSubmit={apply}>
          <label>{copy.fullName}<input name="full_name" minLength={2} maxLength={160} required /></label>
          <label>{copy.company}<input name="company_name" maxLength={160} /></label>
          <label>{copy.website}<input name="website_url" type="url" maxLength={320} /></label>
          <label>{copy.profile}<select name="audience_type" defaultValue="other"><option value="agency">Agency</option><option value="freelance">Freelance</option><option value="influencer">Influencer</option><option value="merchant">E-commerce</option><option value="other">Other</option></select></label>
          <label>{copy.code}<input name="requested_code" maxLength={40} /></label>
          <label className="wide">{copy.promotion}<textarea name="promotion_plan" minLength={12} maxLength={1600} rows={5} required /></label>
          <div className="wide"><button className="button primary" type="submit" disabled={busy === "apply"}>{busy === "apply" ? copy.applying : copy.apply}</button></div>
        </form>
      </section>
    );
  }

  const affiliate = data.affiliate || {};
  const stats = data.stats || {};
  const isActive = affiliate.status === "active" && (affiliate.code_status || "active") === "active";
  const stripeReady = affiliate.stripe_payouts_enabled === true && affiliate.stripe_details_submitted === true;
  const available = number(stats.available_payout_cents);
  const minimum = number(data.payout_minimum_cents);
  const canRequest = isActive && stripeReady && available >= minimum && !data.open_payout_request;
  const pages = Math.max(1, number(data.referred_sites_total_pages));

  return (
    <section className="partner-view view-enter">
      <div className="partner-command">
        <div><p className="eyebrow">{copy.control}</p><h2>{copy.control}</h2><p>{copy.controlBody}</p></div>
        <div className="partner-contract"><span>{copy.status}<strong>{statusLabel(affiliate.status, language)}</strong></span><span>{copy.commission}<strong>{number(affiliate.commission_rate_bps) / 100}%</strong></span><span>{copy.period}<strong>{number(affiliate.commission_months)} {copy.months}</strong></span></div>
      </div>

      {error ? <p className="config-error">{error}</p> : null}
      {notice ? <p className="config-notice" role="status">{notice}</p> : null}

      <div className="partner-link-line">
        <div><span>{copy.referralLink}</span>{referralLink && isActive ? <strong>{referralLink}</strong> : <small>{copy.unavailableLink}</small>}</div>
        {referralLink && isActive ? <button className="button secondary-blue" type="button" onClick={() => void copyLink()}>{copy.copy}</button> : null}
      </div>

      <div className="partner-metrics">
        {[[copy.clicks30, stats.clicks_30d], [copy.clicksTotal, stats.clicks_total], [copy.referrals, stats.referrals_total], [copy.converted, stats.converted_total]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{number(value)}</strong></article>)}
      </div>

      <div className="partner-columns">
        <section className="partner-finance">
          <div className="partner-section-heading"><p className="eyebrow">{copy.financial}</p><h2>{copy.financial}</h2></div>
          <div className="partner-money-grid">
            {[[copy.pending, stats.pending_cents], [copy.approved, stats.approved_cents], [copy.paid, stats.paid_cents], [copy.available, stats.available_payout_cents]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{money(value, "USD", language)}</strong></div>)}
          </div>
        </section>
        <aside className="partner-payout">
          <p className="eyebrow">{copy.stripeTitle}</p>
          <h2>{stripeReady ? copy.stripeReady : copy.stripeNeeded}</h2>
          <p>{data.open_payout_request ? copy.openRequest : copy.threshold.replace("{amount}", money(minimum, "USD", language))}</p>
          {!stripeReady ? <button className="button primary" type="button" disabled={busy === "stripe"} onClick={() => void connectStripe()}>{busy === "stripe" ? copy.connecting : copy.connectStripe}</button> : <button className="button primary" type="button" disabled={!canRequest || busy === "payout"} onClick={() => void requestPayout()}>{busy === "payout" ? copy.requesting : copy.requestPayout}</button>}
        </aside>
      </div>

      <section className="partner-sites">
        <div className="partner-section-heading"><p className="eyebrow">{copy.sites}</p><h2>{copy.sites}</h2><p>{copy.sitesBody}</p></div>
        <form className="partner-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
          <input aria-label={copy.search} placeholder={copy.search} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} />
          <select aria-label={copy.platform} value={platform} onChange={(event) => { setPage(1); setPlatform(event.target.value); }}><option value="">{copy.platform}</option><option value="prestashop">PrestaShop</option><option value="woocommerce">WooCommerce</option><option value="magento">Magento</option><option value="shopify">Shopify</option></select>
          <select aria-label={copy.referralState} value={referralStatus} onChange={(event) => { setPage(1); setReferralStatus(event.target.value); }}><option value="">{copy.referralState}</option><option value="registered">Registered</option><option value="converted">Converted</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select>
          <button className="button secondary-blue" type="submit">{copy.filter}</button>
          <button className="text-action" type="button" onClick={() => { setPage(1); setQueryInput(""); setQuery(""); setPlatform(""); setReferralStatus(""); }}>{copy.clear}</button>
        </form>
        <div className="partner-table" role="table">
          <div className="partner-table-head" role="row"><span>{copy.store}</span><span>{copy.platform}</span><span>{copy.attribution}</span><span>{copy.date}</span></div>
          {(data.referred_sites || []).map((site, index) => <div className="partner-table-row" role="row" key={`${site.shop_base_url || displaySite(site)}-${site.referred_at || site.converted_at || index}`}><strong>{displaySite(site)}</strong><span>{site.platform || "—"}</span><span>{statusLabel(site.referral_status, language)}</span><span>{date(site.converted_at || site.registered_at || site.referred_at, language)}</span></div>)}
          {(data.referred_sites || []).length === 0 ? <p className="partner-empty">{copy.noSites}</p> : null}
        </div>
        <div className="partner-pagination"><span>{number(data.referred_sites_total)} · {page}/{pages}</span><div><button className="button ghost" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy.previous}</button><button className="button ghost" type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>{copy.next}</button></div></div>
      </section>

      <div className="partner-history">
        {[[copy.recentRequests, data.recent_payout_requests], [copy.recentPayouts, data.recent_payouts]].map(([title, rows]) => <section key={String(title)}><h2>{title as string}</h2>{((rows as MoneyRow[]) || []).length ? (rows as MoneyRow[]).map((row, index) => <div className="partner-history-row" key={`${row.status}-${row.created_at}-${index}`}><span>{statusLabel(row.status, language)}<small>{date(row.paid_at || row.requested_at || row.created_at, language)}</small></span><strong>{money(row.amount_cents, row.currency, language)}</strong></div>) : <p>{copy.noHistory}</p>}</section>)}
      </div>
    </section>
  );
}
