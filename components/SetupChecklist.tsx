"use client";

import { useEffect, useState } from "react";
import type { Capabilities } from "@/components/Dashboard";
import type { UiLanguage } from "@/lib/ui-language";
import { reliabilityStages, validCloudHealth } from "@/lib/reliability";

type Shop = { shop_uuid?: string; id?: string; canonical_shop_id?: string; shop_id: string; platform?: string };

export default function SetupChecklist({ capabilities, language }: { capabilities: Capabilities; language: UiLanguage }) {
  const ui = (en: string, fr: string) => language === "fr" ? fr : en;
  const [shop, setShop] = useState<Shop | null>(null);
  const [checked, setChecked] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [sourceVerified, setSourceVerified] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    const load = async () => {
      setBusy(true); setFailed(false); setHealthy(false); setSourceVerified(false); setChecked(false); setShop(null);
      try {
        const response = await fetch("/api/cloud/shops", { cache: "no-store", signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!Array.isArray(body.items)) throw new Error();
        const selected: Shop | undefined = body.items?.[0];
        if (controller.signal.aborted) return;
        setShop(selected || null);
        if (!selected) return;
        const id = selected.shop_uuid || selected.id || selected.canonical_shop_id;
        if (id) {
          try { setChecked(localStorage.getItem(`nc-setup-email-reviewed:${id}`) === "yes"); } catch { /* Optional browser preference. */ }
          if (capabilities.features.sync_health) {
            const query = new URLSearchParams({ shop_uuid: id });
            const [healthResponse, localResponse] = await Promise.all([
              fetch(`/api/cloud/sync-health?${query}`, { cache: "no-store", signal }),
              fetch(`/api/local-data/sync-health?${query}`, { cache: "no-store", signal }),
            ]);
            if (!healthResponse.ok) throw new Error();
            const health = await healthResponse.json();
            if (!validCloudHealth(health)) throw new Error();
            const local = localResponse.ok ? await localResponse.json() : null;
            const stages = reliabilityStages(health, local, selected.shop_id);
            const verified = stages.some(stage => stage.id === "source" && stage.state === "verified");
            if (!controller.signal.aborted) {
              setSourceVerified(verified);
              setHealthy(health.state === "healthy" && health.online === true && verified && stages.some(stage => stage.id === "processing" && stage.state === "verified"));
            }
          }
        }
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void load();
    return () => controller.abort();
  }, [refresh, capabilities.features.sync_health]);

  const connector = capabilities.connectors?.find(item => item.shop_id === shop?.shop_id);
  const connectorReady = Boolean(connector?.installed_version && connector.last_seen_at && ["current", "available"].includes(connector.status)) || (!connector && sourceVerified);
  const steps = [
    { title: ui("Connect your account", "Connecter votre compte"), done: true, detail: ui("Your Cloud account is connected.", "Votre compte Cloud est connecté."), href: "#features" },
    { title: ui("Check your store", "Vérifier votre boutique"), done: Boolean(shop), detail: shop ? `${shop.shop_id} · ${shop.platform || ""}` : ui("Check the store assigned to this installation.", "Vérifiez la boutique attribuée à cette installation."), href: "?tool=shop#configuration" },
    { title: ui("Install the connector", "Installer le connecteur"), done: connectorReady, detail: ui("Install and configure the official module in PrestaShop, WooCommerce or Magento. Creating a key alone is not enough.", "Installez et configurez le module officiel dans PrestaShop, WooCommerce ou Magento. Créer une clé ne suffit pas."), href: "?tool=connector#configuration" },
    { title: ui("Review email settings", "Vérifier les réglages email"), done: checked, detail: ui("Check language, sender settings and approval preferences, then generate a preview. This step is confirmed by you, not by an email send.", "Vérifiez la langue, les réglages d’expéditeur et les préférences de validation, puis générez un aperçu. Cette étape est confirmée par vous, pas par un envoi."), href: "?tool=email#configuration" },
    { title: ui("Check synchronization", "Vérifier la synchronisation"), done: healthy, detail: ui("Check that the connector is sending activity and that synchronization is healthy.", "Vérifiez que le connecteur transmet l’activité et que la synchronisation est saine."), href: capabilities.features.sync_health ? "#sync-health" : "?tool=connector#configuration" },
  ];
  return <section className="setup-checklist" aria-labelledby="setup-heading" aria-busy={busy}>
    <header><div><p className="eyebrow">{ui("Getting started", "Premiers pas")}</p><h2 id="setup-heading">{ui("Finish your configuration", "Terminez votre configuration")}</h2></div>
      <button className="button ghost setup-toggle" type="button" aria-expanded={expanded} aria-controls="setup-steps"
        aria-label={expanded ? ui("Hide installation steps", "Replier les étapes d’installation") : ui("Show installation steps", "Déplier les étapes d’installation")}
        onClick={() => setExpanded(value => !value)}>
        <span>{expanded ? ui("Hide steps", "Replier") : ui("Show steps", "Déplier")}</span>
        <span className="disclosure-sign" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button></header>
    <div id="setup-steps" hidden={!expanded}>
    <p>{ui("Installation is only the first step. Complete these checks before using your store’s automations.", "L’installation est la première étape. Effectuez ces vérifications avant d’utiliser les automatisations de votre boutique.")}</p>
    <button className="button ghost" type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{ui("Check again", "Vérifier à nouveau")}</button>
    {failed ? <p role="alert">{ui("Some checks are unavailable. Retry or open Configuration; no completed step has been assumed.", "Certaines vérifications sont indisponibles. Réessayez ou ouvrez Configuration ; aucune étape n’a été supposée terminée.")}</p> : null}
    <ol>{steps.map((step, index) => <li key={step.title}>
      <div><strong>{step.title}</strong><span>{busy && index > 0 ? ui("Checking…", "Vérification…") : step.done ? ui("Done", "Terminé") : ui("To check", "À vérifier")}</span></div>
      <p>{step.detail}</p><a href={step.href}>{ui("Open", "Ouvrir")} →</a>
      {index === 3 && shop ? <label><input type="checkbox" checked={checked} onChange={event => {
        const value = event.target.checked; setChecked(value);
        const id = shop.shop_uuid || shop.id || shop.canonical_shop_id;
        if (id) try { localStorage.setItem(`nc-setup-email-reviewed:${id}`, value ? "yes" : "no"); } catch { /* No secret or operational state is stored. */ }
      }} />{ui("I reviewed these settings (this browser only)", "J’ai vérifié ces réglages (ce navigateur uniquement)")}</label> : null}
    </li>)}</ol>
    </div>
  </section>;
}
