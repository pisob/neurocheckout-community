"use client";
import { useEffect, useId, useRef, useState } from "react";

export default function LocalUpdate({ french }: { french: boolean }) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    if (!confirming) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false);
      if (event.key === "Tab") {
        const controls = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button, a[href]") || []);
        if (controls.length === 0) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerButtonRef.current?.focus();
    };
  }, [confirming]);
  const busy = pending || ["queued", "verifying", "downloading", "building", "restarting"].includes(phase);
  const labels: Record<string, string> = french ? {
    queued: "Mise à jour en attente…", verifying: "Vérification de la release…", downloading: "Téléchargement sécurisé…", building: "Préparation de la mise à jour…", restarting: "Redémarrage…", failed: "Échec de la mise à jour. Réessayez ou consultez le guide.", rolled_back: "L’ancienne version a été restaurée.", interrupted: "La mise à jour a été interrompue.", complete: "Mise à jour terminée.",
  } : {
    queued: "Update queued…", verifying: "Verifying release…", downloading: "Downloading securely…", building: "Preparing update…", restarting: "Restarting…", failed: "Update failed. Retry or consult the guide.", rolled_back: "The previous version was restored.", interrupted: "Update interrupted.", complete: "Update complete.",
  };
  async function update() {
    setConfirming(false);
    setPending(true); setPhase("queued");
    try {
      const response = await fetch("/api/local-update", { method: "POST" });
      if (!response.ok) throw new Error();
    } catch { setPending(false); setPhase("failed"); }
  }
  return <div className="local-update-actions">
    {available ? <button ref={triggerButtonRef} type="button" className="button secondary-blue" disabled={busy} onClick={() => setConfirming(true)}>{busy ? (french ? "Mise à jour en cours…" : "Updating…") : (french ? "Mettre à jour" : "Update securely")}</button> :
      <a className="button ghost" href="https://github.com/pisob/neurocheckout-community/blob/main/docs/INSTALLATION.md#upgrade" target="_blank" rel="noreferrer">{french ? "Guide de mise à jour" : "Update guide"}</a>}
    <span role="status" aria-live="polite">{labels[phase] || ""}</span>
    {confirming ? <div className="update-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setConfirming(false);
    }}>
      <section ref={modalRef} className="update-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="update-modal-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18.5h14" /></svg>
        </div>
        <p className="update-modal-eyebrow">{french ? "MISE À JOUR SIGNÉE" : "SIGNED UPDATE"}</p>
        <h2 id={titleId}>{french ? "Installer la nouvelle version ?" : "Install the new version?"}</h2>
        <p id={descriptionId} className="update-modal-copy">{french
          ? "Community redémarrera brièvement pour appliquer la release officielle."
          : "Community will briefly restart to apply the official release."}</p>
        <div className="update-modal-assurance">
          <span aria-hidden="true">✓</span>
          <div><strong>{french ? "Configuration conservée" : "Configuration preserved"}</strong><small>{french ? "Vos réglages et votre connexion Cloud ne seront pas supprimés." : "Your settings and Cloud connection will not be removed."}</small></div>
        </div>
        <div className="update-modal-actions">
          <button type="button" className="button ghost" onClick={() => setConfirming(false)}>{french ? "Plus tard" : "Not now"}</button>
          <button ref={confirmButtonRef} type="button" className="button primary update-modal-confirm" onClick={() => void update()}>{french ? "Installer maintenant" : "Install now"}<span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div> : null}
  </div>;
}
