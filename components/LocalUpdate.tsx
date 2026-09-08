"use client";
import { useEffect, useState } from "react";

export default function LocalUpdate({ french }: { french: boolean }) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/local-update", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setAvailable(data.available);
        setPhase(data.phase);
        if (data.phase === "complete" && pending) window.location.reload();
        if (["complete", "failed", "rolled_back", "interrupted"].includes(data.phase)) setPending(false);
      } catch { /* Keep polling during the server restart. */ }
    };
    void poll();
    const timer = setInterval(poll, pending ? 3000 : 15000);
    return () => { active = false; clearInterval(timer); };
  }, [pending]);
  const busy = pending || ["queued", "verifying", "building", "restarting"].includes(phase);
  const labels: Record<string, string> = french ? {
    queued: "Mise à jour en attente…", verifying: "Vérification de la release…", building: "Préparation de la mise à jour…", restarting: "Redémarrage…", failed: "Échec de la mise à jour. Réessayez ou consultez le guide.", rolled_back: "L’ancienne version a été restaurée.", interrupted: "La mise à jour a été interrompue.", complete: "Mise à jour terminée.",
  } : {
    queued: "Update queued…", verifying: "Verifying release…", building: "Preparing update…", restarting: "Restarting…", failed: "Update failed. Retry or consult the guide.", rolled_back: "The previous version was restored.", interrupted: "Update interrupted.", complete: "Update complete.",
  };
  async function update() {
    if (!window.confirm(french ? "Installer la mise à jour signée ? Community redémarrera brièvement. Votre configuration sera conservée." : "Install the signed update? Community will briefly restart. Your configuration will be preserved.")) return;
    setPending(true); setPhase("queued");
    try {
      const response = await fetch("/api/local-update", { method: "POST" });
      if (!response.ok) throw new Error();
    } catch { setPending(false); setPhase("failed"); }
  }
  return <div className="local-update-actions">
    {available ? <button type="button" className="button secondary-blue" disabled={busy} onClick={() => void update()}>{busy ? (french ? "Mise à jour en cours…" : "Updating…") : (french ? "Mettre à jour" : "Update securely")}</button> :
      <a className="button ghost" href="https://github.com/pisob/neurocheckout-community/blob/main/docs/INSTALLATION.md#upgrade" target="_blank" rel="noreferrer">{french ? "Guide de mise à jour" : "Update guide"}</a>}
    <span role="status" aria-live="polite">{labels[phase] || ""}</span>
  </div>;
}
