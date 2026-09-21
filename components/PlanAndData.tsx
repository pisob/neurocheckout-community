"use client";

import { useEffect, useMemo, useState } from "react";

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
        "This account already has a billing relationship. Use Manage billing instead.",
        "Ce compte possède déjà une relation de facturation. Utilisez Gérer la facturation.",
      );
    }
    if (detail === "stripe_checkout_state_uncertain_retry_same_intent") {
      return ui(
        "Stripe did not return a definitive result. Wait one minute, then retry the same selection safely.",
        "Stripe n’a pas renvoyé de résultat définitif. Attendez une minute, puis reprenez le même choix en sécurité.",
      );
    }
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
          {capabilities.upgrade.available ? <button className="button primary" type="button" disabled={busy !== null || !authoritativeContract} onClick={() => void startSubscription()}>{busy === "checkout" ? ui("Opening…", "Ouverture…") : capabilities.upgrade.action === "upgrade" ? ui("Upgrade to Pro", "Passer à Pro") : ui("Continue securely", "Continuer en sécurité")}</button> : null}
          {capabilities.subscription.can_manage_billing ? <button className="button ghost" type="button" disabled={busy !== null || !authoritativeContract} onClick={() => void openBillingPortal()}>{busy === "portal" ? ui("Opening…", "Ouverture…") : ui("Manage billing", "Gérer la facturation")}</button> : null}
          <button className="button ghost" type="button" disabled={busy !== null} onClick={() => void refresh()}>{busy === "refresh" ? ui("Refreshing…", "Actualisation…") : ui("Refresh entitlements", "Actualiser les droits")}</button>
        </div>
      </div>

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
