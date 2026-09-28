"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Capabilities } from "@/components/Dashboard";
import { publicErrorMessage, publicFeatureLabel } from "@/lib/public-presentation";
import type { UiLanguage } from "@/lib/ui-language";

type Props = {
  capabilities: Capabilities;
  language: UiLanguage;
  billingNotice: string | null;
  onRefresh: () => Promise<void>;
};

type JsonPayload = {
  detail?: string;
  checkout_url?: string;
  portal_url?: string;
  already_paid_active?: boolean;
};

const CHECKOUT_INTENT_MAX_AGE_MS = 25 * 60 * 60 * 1000;

type StoredCheckoutIntent = {
  id: string;
  created_at: number;
};

type PricePreview = { plan_code: string; billing_cycle: string; amount: number; currency: string; tax_behavior: string; limits: { shops: number | null; agents: number | null; emails: number | null; email_scope?: string } };

function readCheckoutIntent(key: string): StoredCheckoutIntent | null {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null") as StoredCheckoutIntent | null;
      if (parsed) return parsed;
    } catch {
      // Try the browser's other storage area before generating a new intent.
    }
  }
  return null;
}

function persistCheckoutIntent(key: string, intent: StoredCheckoutIntent): void {
  const serialized = JSON.stringify(intent);
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.setItem(key, serialized);
      return;
    } catch {
      // The Cloud reservation remains authoritative if storage is disabled.
    }
  }
}

const STATUS_COPY: Record<string, { en: string; fr: string; tone: string }> = {
  pending: { en: "Plan selection required", fr: "Choix de l’offre requis", tone: "attention" },
  free_active: { en: "Community active", fr: "Community actif", tone: "active" },
  trial_active: { en: "Trial active", fr: "Essai actif", tone: "active" },
  paid_active: { en: "Subscription active", fr: "Abonnement actif", tone: "active" },
  payment_failed_grace: { en: "Payment action required", fr: "Action de paiement requise", tone: "attention" },
  suspended: { en: "Subscription suspended", fr: "Abonnement suspendu", tone: "blocked" },
  expired: { en: "Subscription expired", fr: "Abonnement expiré", tone: "blocked" },
  cancelled: { en: "Subscription cancelled", fr: "Abonnement annulé", tone: "blocked" },
};

async function payload(response: Response): Promise<JsonPayload> {
  const parsed = await response.json().catch(() => ({}));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as JsonPayload
    : {};
}

export default function PlanAndData({ capabilities, language, billingNotice, onRefresh }: Props) {
  const ui = (english: string, french: string) => language === "fr" ? french : english;
  const targets = capabilities.upgrade.target_plans || [];
  const [selectedPlan, setSelectedPlan] = useState(targets[0] || "starter");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    capabilities.subscription.billing_cycle === "annual" ? "annual" : "monthly",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(billingNotice);
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const [proposedAction, setProposedAction] = useState<"checkout" | "portal">("checkout");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [comparisonPlan, setComparisonPlan] = useState("starter");
  const [price, setPrice] = useState<PricePreview | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const previewPlan = proposedAction === "portal" ? comparisonPlan : capabilities.upgrade.action === "upgrade" ? "pro" : selectedPlan;
  const review = (action: "checkout" | "portal") => {
    confirmationTrigger.current = document.activeElement as HTMLElement;
    setProposedAction(action);
    setComparisonPlan(capabilities.plan.code === "starter" ? "pro" : "starter");
    setPrice(null); setPriceLoading(true); setReviewOpen(true);
    confirmation.current?.showModal();
  };

  useEffect(() => {
    if (!reviewOpen) return;
    const controller = new AbortController();
    setPrice(null); setPriceLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/cloud/subscription/preview?${new URLSearchParams({ plan_code: previewPlan, billing_cycle: billingCycle })}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || data.plan_code !== previewPlan || data.billing_cycle !== billingCycle || typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0 || !/^[A-Z]{3}$/.test(data.currency) || !data.limits) return;
        if (!controller.signal.aborted) setPrice(data);
      } catch { /* Never show a cached or estimated price on failure. */ }
      finally { if (!controller.signal.aborted) setPriceLoading(false); }
    })();
    return () => controller.abort();
  }, [reviewOpen, previewPlan, billingCycle]);

  useEffect(() => {
    if (targets.length && !targets.includes(selectedPlan)) setSelectedPlan(targets[0]);
  }, [selectedPlan, targets]);

  useEffect(() => setNotice(billingNotice), [billingNotice]);

  const status = STATUS_COPY[capabilities.subscription.status] || {
    en: "Status unavailable",
    fr: "Statut indisponible",
    tone: "attention",
  };
  const enabledFeatures = useMemo(
    () => Object.entries(capabilities.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => ({ feature, label: publicFeatureLabel(feature, language) }))
      .filter((item): item is { feature: string; label: string } => Boolean(item.label)),
    [capabilities.features, language],
  );
  const dataResidency = capabilities.data_residency;
  const upgradeLabel = capabilities.upgrade.action === "upgrade" || selectedPlan === "pro"
    ? ui("Upgrade to Pro", "Passer à Pro")
    : selectedPlan === "starter"
      ? ui("Upgrade to Starter", "Passer à Starter")
      : ui("Change plan", "Changer d’offre");
  const authoritativeContract = capabilities.manifest?.authority === "neurocheckout_cloud"
    && capabilities.manifest.deny_by_default === true;

  const redirectTo = (url: string | undefined) => {
    const secureUrl = Boolean(url && /^https:\/\//i.test(url));
    const loopbackUrl = Boolean(url && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(url));
    if (!url || (!secureUrl && !loopbackUrl)) {
      throw new Error(ui("Billing returned an invalid URL.", "La facturation a renvoyé une URL invalide."));
    }
    window.location.assign(url);
  };

  const billingError = (detail: string | undefined) => {
    if (detail === "community_scope_required") {
      return ui(
        "Reconnect this installation once to authorize secure billing actions.",
        "Reconnectez cette installation une fois pour autoriser les actions de facturation sécurisées.",
      );
    }
    if (detail === "community_checkout_already_in_progress") {
      return ui(
        "A secure checkout is already in progress for this account. Resume it from the original tab or retry with the same selection.",
        "Un paiement sécurisé est déjà en cours pour ce compte. Reprenez-le dans l’onglet d’origine ou réessayez avec la même sélection.",
      );
    }
    if (detail === "billing_portal_required_for_existing_subscription") {
      return ui(
        "This account already has a billing relationship. Use Change plan — Upgrade / Downgrade instead.",
        "Ce compte possède déjà une relation de facturation. Utilisez Changer d’offre — Upgrade / Downgrade.",
      );
    }
    if (detail === "stripe_checkout_state_uncertain_retry_same_intent") {
      return ui(
        "Stripe did not return a definitive result. Wait one minute, then retry the same selection safely.",
        "Stripe n’a pas renvoyé de résultat définitif. Attendez une minute, puis reprenez le même choix en sécurité.",
      );
    }
    if (detail === "community_checkout_policy_changed") return ui(
      "This previous checkout can no longer be used. Wait for it to expire, then retry. Do not confirm an older payment link.",
      "Ce précédent paiement ne peut plus être repris. Attendez son expiration puis réessayez. Ne confirmez pas un ancien lien de paiement.",
    );
    return publicErrorMessage(
      detail,
      { en: "Billing action failed.", fr: "L’action de facturation a échoué." },
      language,
    );
  };

  const startSubscription = async () => {
    setBusy("checkout");
    setError(null);
    setNotice(null);
    try {
      if (capabilities.upgrade.action === "upgrade") {
        const response = await fetch("/api/cloud/subscription/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billing_cycle: billingCycle }),
        });
        const result = await payload(response);
        if (!response.ok) throw new Error(billingError(result.detail));
        redirectTo(result.checkout_url || result.portal_url);
        return;
      }

      const selection = await fetch("/api/cloud/subscription/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: selectedPlan }),
      });
      const selected = await payload(selection);
      if (!selection.ok) throw new Error(billingError(selected.detail));

      const intentStorageKey = `nc-community-checkout-intent:${selectedPlan}:${billingCycle}`;
      const storedIntent = readCheckoutIntent(intentStorageKey);
      let intentId = typeof storedIntent?.id === "string" ? storedIntent.id : "";
      const intentAge = Date.now() - Number(storedIntent?.created_at || 0);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)
        || !Number.isFinite(intentAge)
        || intentAge < 0
        || intentAge > CHECKOUT_INTENT_MAX_AGE_MS
      ) {
        intentId = window.crypto.randomUUID();
        persistCheckoutIntent(intentStorageKey, { id: intentId, created_at: Date.now() });
      }
      const response = await fetch("/api/cloud/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing_cycle: billingCycle, intent_id: intentId }),
      });
      const result = await payload(response);
      if (!response.ok) throw new Error(billingError(result.detail));
      if (result.already_paid_active) {
        await onRefresh();
        setNotice(ui("Your paid subscription is already active.", "Votre abonnement payant est déjà actif."));
        setBusy(null);
        return;
      }
      redirectTo(result.checkout_url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : billingError(undefined));
      setBusy(null);
    }
  };

  const openBillingPortal = async () => {
    setBusy("portal");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cloud/subscription/portal", { method: "POST" });
      const result = await payload(response);
      if (!response.ok) throw new Error(billingError(result.detail));
      redirectTo(result.portal_url || result.checkout_url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : billingError(undefined));
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    setError(null);
    try {
      await onRefresh();
      setNotice(ui("Cloud entitlements refreshed.", "Droits Cloud actualisés."));
    } catch {
      setError(ui("Entitlements could not be refreshed.", "Les droits n’ont pas pu être actualisés."));
    } finally {
      setBusy(null);
    }
  };

  const protectionSummary = [
    {
      key: "local-protection",
      title: ui("Local protection", "Protection locale"),
      items: [
        ui("Encrypted local storage", "Stockage local chiffré"),
        ui("Administrator-controlled backups", "Sauvegardes contrôlées par l’administrateur"),
      ],
    },
    {
      key: "limited-sync",
      title: ui("Limited synchronization", "Synchronisation limitée"),
      items: [
        ui("Only data required by enabled services", "Uniquement les données nécessaires aux services activés"),
        ui("Authenticated exchanges", "Échanges authentifiés"),
      ],
    },
    {
      key: "protected-service",
      title: ui("Protected service", "Service protégé"),
      items: [
        ui("Access restricted to the authorized account", "Accès limité au compte autorisé"),
        ui("Permissions verified before each action", "Autorisations vérifiées avant chaque action"),
      ],
    },
    {
      key: "continuity",
      title: ui("Data continuity", "Continuité des données"),
      items: [
        ui("Local data preserved across plan changes", "Données locales conservées lors des changements d’offre"),
        ui("Billing recovery does not erase local data", "La récupération de facturation n’efface pas les données locales"),
      ],
    },
  ];

  return (
    <section className="view-enter plan-data-view">
      <div className={`subscription-band ${status.tone}`}>
        <div>
          <p className="eyebrow">{ui("Permanent self-hosted interface", "Interface auto-hébergée permanente")}</p>
          <h2>{capabilities.plan.code.toUpperCase()} · {status[language]}</h2>
          <p>{ui(
            "Your self-hosted interface keeps its local data encrypted and connects securely to NeuroCheckout services.",
            "Votre interface auto-hébergée conserve ses données locales chiffrées et se connecte de manière sécurisée aux services NeuroCheckout.",
          )}</p>
        </div>
        <span className="subscription-state"><i />{status[language]}</span>
      </div>

      {capabilities.subscription.grace_ends_at ? (
        <div className="billing-alert" role="alert">
          <strong>{ui("Payment grace period", "Période de grâce de paiement")}</strong>
          <span>{ui("Update payment before", "Mettez à jour le paiement avant le")} {new Date(capabilities.subscription.grace_ends_at).toLocaleString(language === "fr" ? "fr-FR" : "en-US")}</span>
        </div>
      ) : null}
      {notice ? <p className="config-notice" role="status">{notice}</p> : null}
      {error ? <p className="config-error" role="alert">{error}</p> : null}
      {!authoritativeContract ? <p className="config-error" role="alert">{ui(
        "The Cloud entitlement contract is unavailable or outdated. Billing actions are disabled until the connection is refreshed.",
        "Le contrat de droits Cloud est indisponible ou obsolète. Les actions de facturation sont désactivées jusqu’à l’actualisation de la connexion.",
      )}</p> : null}

      <div className="subscription-controls">
        <div>
          <span>{ui("Plan", "Offre")}</span>
          {targets.length ? (
            <select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)} disabled={busy !== null}>
              {targets.map((target) => <option key={target} value={target}>{target.toUpperCase()}</option>)}
            </select>
          ) : <strong>{capabilities.plan.code.toUpperCase()}</strong>}
        </div>
        <div>
          <span>{ui("Billing", "Facturation")}</span>
          <select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value as "monthly" | "annual")} disabled={busy !== null || !targets.length}>
            <option value="monthly">{ui("Monthly", "Mensuelle")}</option>
            <option value="annual">{ui("Annual", "Annuelle")}</option>
          </select>
        </div>
        <div className="subscription-actions">
          {capabilities.upgrade.available ? <button className="button primary" type="button" disabled={busy !== null || !authoritativeContract} onClick={() => review("checkout")}>{busy === "checkout" ? ui("Opening…", "Ouverture…") : upgradeLabel}</button> : null}
          {capabilities.subscription.can_manage_billing ? <button className="button ghost" type="button" disabled={busy !== null || !authoritativeContract} onClick={() => review("portal")}>{busy === "portal" ? ui("Opening…", "Ouverture…") : ui("Change plan — Upgrade / Downgrade", "Changer d’offre — Upgrade / Downgrade")}</button> : null}
          <button className="button ghost" type="button" disabled={busy !== null} onClick={() => void refresh()}>{busy === "refresh" ? ui("Refreshing…", "Actualisation…") : ui("Refresh entitlements", "Actualiser les droits")}</button>
        </div>
      </div>

      <dialog ref={confirmation} className="plan-review-dialog" aria-labelledby="plan-review-title" onClose={() => { setReviewOpen(false); confirmationTrigger.current?.focus(); }}>
        <h2 id="plan-review-title">{ui("Review your plan change", "Vérifiez votre changement d’offre")}</h2>
        <p>{ui("Current plan", "Offre actuelle")} : <strong>{capabilities.plan.code.toUpperCase()}</strong></p>
        {proposedAction === "checkout" ? <>
          <p>{ui("Selected plan", "Offre choisie")} : <strong>{(capabilities.upgrade.action === "upgrade" ? "pro" : selectedPlan).toUpperCase()}</strong> · {billingCycle === "annual" ? ui("Annual billing", "Facturation annuelle") : ui("Monthly billing", "Facturation mensuelle")}</p>
          {capabilities.subscription.status === "free_active" ? <p className="config-notice">{ui("Paid subscription, without a new 30-day trial. Payment is required to activate the selected plan.", "Abonnement payant, sans nouvel essai de 30 jours. Le paiement est nécessaire pour activer l’offre choisie.")}</p> : null}
        </> : <p>{ui("Choose the available plan or cancellation option in the billing portal. Opening the portal does not change your subscription.", "Choisissez l’offre disponible ou l’option de résiliation dans le portail de facturation. Ouvrir le portail ne modifie pas votre abonnement.")}</p>}
        {proposedAction === "portal" ? <label>{ui("Compare an offer", "Comparer une offre")}<select value={comparisonPlan} onChange={event => setComparisonPlan(event.target.value)}><option value="starter">Starter</option><option value="pro">Pro</option></select></label> : null}
        <div className="config-notice" role="status">
          {priceLoading ? ui("Checking the current price…", "Vérification du tarif actuel…") : price ? <>
            <strong>{ui("Recurring base price", "Tarif de base récurrent")} : {new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { style: "currency", currency: price.currency }).format(price.amount)} / {billingCycle === "annual" ? ui("year", "an") : ui("month", "mois")}</strong>
            <p>{price.tax_behavior === "inclusive" ? ui("Taxes included in the configured price.", "Taxes incluses dans le tarif configuré.") : ui("Applicable taxes are confirmed in Stripe.", "Les taxes applicables sont confirmées dans Stripe.")}</p>
            <p>{ui("New limits", "Nouvelles limites")} : {price.limits.shops ?? "∞"} {ui("stores", "boutiques")} · {price.limits.agents ?? "∞"} agents · {price.limits.emails ?? "∞"} {ui("emails per month", "emails par mois")}{price.limits.email_scope === "shop" ? ui(" per store", " par boutique") : ""}</p>
            <small>{ui("This is not an invoice quote. Discounts, currency conversion and any adjustment are calculated at confirmation.", "Ce tarif n’est pas un devis de facture. Les remises, la conversion de devise et les ajustements sont calculés à la confirmation.")}</small>
          </> : ui("The current price could not be verified. Check the exact amount in Stripe before confirming.", "Le tarif actuel n’a pas pu être vérifié. Contrôlez le montant exact dans Stripe avant de confirmer.")}
        </div>
        <p>{ui("The up-to-date price, taxes, any adjustment and effective date will be shown by Stripe before you confirm. No amount is estimated here.", "Stripe affichera le tarif actualisé, les taxes, l’éventuel ajustement et la date d’effet avant votre confirmation. Aucun montant n’est estimé ici.")}</p>
        <p>{ui("If you downgrade, check the new store, agent and email limits before confirming. Your local data is preserved; available features may change. If the desired offer is missing, return here without cancelling your subscription.", "En cas de baisse d’offre, vérifiez les nouvelles limites de boutiques, d’agents et d’emails avant de confirmer. Vos données locales sont conservées ; les fonctionnalités disponibles peuvent changer. Si l’offre souhaitée est absente, revenez ici sans résilier votre abonnement.")}</p>
        <div className="actions">
          <button className="button ghost" autoFocus type="button" onClick={() => confirmation.current?.close()}>{ui("Not now", "Plus tard")}</button>
          <button className="button primary" type="button" disabled={busy !== null || !authoritativeContract} onClick={() => {
            confirmation.current?.close();
            void (proposedAction === "portal" ? openBillingPortal() : startSubscription());
          }}>{ui("Continue to secure billing", "Continuer vers la facturation sécurisée")}</button>
        </div>
      </dialog>

      <div className="preservation-note">
        <strong>{ui("Non-destructive plan changes", "Changements d’offre non destructifs")}</strong>
        <span>{ui("Downgrades, payment failures and suspensions never delete your local vault, configuration or backups.", "Les rétrogradations, échecs de paiement et suspensions ne suppriment jamais votre coffre local, votre configuration ou vos sauvegardes.")}</span>
      </div>

      <header className="data-boundary-heading">
        <div><p className="eyebrow">{ui("Privacy safeguards", "Garanties de confidentialité")}</p><h2>{ui("How your data is protected", "Comment vos données sont protégées")}</h2></div>
        <span>{ui("Verified secure connection", "Connexion sécurisée vérifiée")}</span>
      </header>
      {dataResidency ? <div className="data-boundary-grid">
        {protectionSummary.map((group, index) => (
          <section key={group.key}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{group.title}</h3>
            <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div> : <p className="config-error" role="alert">{ui(
        "Data-protection information is temporarily unavailable.",
        "Les informations de protection des données sont temporairement indisponibles.",
      )}</p>}

      <header className="data-boundary-heading feature-heading">
        <div><p className="eyebrow">{ui("Current entitlements", "Droits actuels")}</p><h2>{enabledFeatures.length} {ui("features enabled", "fonctionnalités activées")}</h2></div>
        <span>{ui("Recalculated server-side", "Recalculés côté serveur")}</span>
      </header>
      <div className="feature-matrix">
        {enabledFeatures.map(({ feature, label }, index) => (
          <article key={feature}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{label}</strong><small>{ui("Available in this installation", "Disponible dans cette installation")}</small></div><i aria-label={ui("Available", "Disponible")}>✓</i></article>
        ))}
      </div>
    </section>
  );
}
