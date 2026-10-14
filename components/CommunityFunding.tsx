"use client";

import { useEffect, useRef, useState } from "react";
import { fundingEligible, parseFunding, supportUrl, type Funding, type FundingCapabilities } from "@/lib/community-funding";
import type { UiLanguage } from "@/lib/ui-language";

type Props = { capabilities: FundingCapabilities | null; fresh: boolean; verifiedAt: number | null; language: UiLanguage; view: "overview" | "features" };

export default function CommunityFunding({ capabilities, fresh, verifiedAt, language, view }: Props) {
  const allowed = fundingEligible(capabilities, fresh);
  const [funding, setFunding] = useState<Funding | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const supportRequest = useRef<AbortController | null>(null);
  const ui = (en: string, fr: string) => language === "fr" ? fr : en;

  useEffect(() => {
    setFunding(null); setDestination(null); setError(false); setBusy(false);
    if (!allowed) return;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => controller.abort(), 4000);
    void (async () => {
      try {
        const response = await fetch("/api/cloud/community-funding", { cache: "no-store", signal: controller.signal });
        const data = response.ok ? parseFunding(await response.json()) : null;
        if (controller.signal.aborted || !data) return;
        setFunding(data);
        expiry = setTimeout(() => { setFunding(null); setDestination(null); supportRequest.current?.abort(); }, Math.max(0, Date.parse(data.expires_at) - Date.now()));
      } catch { /* Optional funding is hidden on failure; operational UI continues. */ }
      finally { clearTimeout(deadline); }
    })();
    return () => { controller.abort(); clearTimeout(deadline); clearTimeout(expiry); supportRequest.current?.abort(); };
  }, [allowed, verifiedAt]);

  if (!allowed || !funding || Date.parse(funding.expires_at) <= Date.now()) return null;
  const sponsor = funding.sponsor;
  const support = funding.support;

  async function prepareSupport() {
    if (!allowed || !support || busy) return;
    supportRequest.current?.abort();
    const controller = new AbortController();
    supportRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 10_000);
    setBusy(true); setError(false); setDestination(null);
    try {
      const response = await fetch("/api/cloud/community-funding/support", {
        method: "POST", cache: "no-store", signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !supportUrl(data.url, support.mode)) throw new Error("support_unavailable");
      if (!controller.signal.aborted) setDestination(data.url);
    } catch {
      if (supportRequest.current === controller) setError(true);
    } finally {
      clearTimeout(deadline);
      if (supportRequest.current === controller) setBusy(false);
    }
  }

  if (view === "overview" && sponsor) {
    const copy = sponsor[language];
    return <aside className="community-funding" aria-labelledby="community-sponsor-title">
      <div><p className="eyebrow">{ui("Sponsored · Supports Community", "Sponsorisé · Finance Community")}</p>
        <h2 id="community-sponsor-title">{copy.title}</h2><p>{copy.description}</p></div>
      <a className="button secondary" href={sponsor.url} target="_blank" rel="sponsored noopener noreferrer" referrerPolicy="no-referrer">
        {ui("View offer", "Découvrir l’offre")} <span aria-hidden="true">↗</span>
        <span className="funding-sr-only">{ui(" (opens in a new tab)", " (nouvel onglet)")}</span>
      </a>
    </aside>;
  }
  if (view === "features" && support) return <section className="community-funding" aria-labelledby="community-support-title">
    <div><p className="eyebrow">{ui("Voluntary support", "Soutien volontaire")}</p>
      <h2 id="community-support-title">{ui("Support NeuroCheckout Community", "Soutenez NeuroCheckout Community")}</h2>
      <p>{ui("Community is free. Your contribution helps fund its development, maintenance and services. Thank you for your support!", "Community est gratuit. Votre contribution nous aide à financer son développement, sa maintenance et les services nécessaires à son fonctionnement. Merci pour votre soutien !")}</p>
      <p className="funding-note">{ui("Optional, one-time contribution. Choose your amount on Stripe. No change to your plan, quotas or features.", "Contribution facultative et ponctuelle. Choisissez votre montant sur Stripe. Aucun changement de votre offre, de vos quotas ou de vos fonctionnalités.")}</p>
      {support.mode === "test" ? <p className="funding-note">{ui("Stripe test mode — no real payment.", "Mode test Stripe — aucun paiement réel.")}</p> : null}
      {error ? <p role="alert">{ui("Support payments are temporarily unavailable. You can continue using Community normally.", "Le paiement de soutien est momentanément indisponible. Vous pouvez continuer à utiliser Community normalement.")}</p> : null}
    </div>
    {destination ? <a className="button secondary" href={destination} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ui("Continue to Stripe ↗", "Continuer vers Stripe ↗")}</a>
      : <button className="button secondary" type="button" onClick={() => void prepareSupport()} disabled={busy}>{busy ? ui("Checking…", "Vérification…") : ui("Support Community", "Soutenir Community")}</button>}
  </section>;
  return null;
}
