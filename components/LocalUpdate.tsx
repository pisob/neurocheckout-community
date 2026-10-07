"use client";
import { useEffect, useId, useRef, useState } from "react";
import { publicErrorMessage } from "@/lib/public-presentation";

export default function LocalUpdate({ french }: { french: boolean }) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [versions, setVersions] = useState<{ current?: string; latest?: string }>({});
  const [checkError, setCheckError] = useState("");
  const [failureCode, setFailureCode] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const requestedAt = useRef(0);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/local-update", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;
        setAvailable(data.available);
        setCheckError("");
        setFailureCode(typeof data.error_code === "string" ? data.error_code : "");
        setVersions({ current: data.current_version, latest: data.latest_version });
        const verified = data.completion_verified === true && data.current_version === data.latest_version && data.version === data.current_version;
        setPhase(data.phase === "complete" && !verified ? "confirming" : data.phase);
        if (verified && pending) window.location.reload();
        if (verified || ["failed", "rolled_back", "interrupted"].includes(data.phase)) setPending(false);
        if (pending && data.phase === "idle" && Date.now() - requestedAt.current > 15000) {
          setPending(false);
          setCheckError(french ? "Aucune mise à jour en cours n’est confirmée. Vous pouvez réessayer." : "No running update is confirmed. You can retry.");
        }
      } catch {
        if (active) setCheckError(french ? "Vérification temporairement indisponible. Reconnexion automatique ; ne relancez pas l’installation pendant le redémarrage." : "Version check temporarily unavailable. Reconnecting automatically; do not restart installation during the restart.");
      }
    };
    void poll();
    const timer = setInterval(poll, pending ? 3000 : 15000);
    return () => { active = false; clearInterval(timer); };
  }, [pending, french]);
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
  const busy = pending || ["queued", "preflight", "backing_up", "verifying", "downloading", "building", "restarting", "confirming"].includes(phase);
  const labels: Record<string, string> = french ? {
    preflight: "Vérification de l’espace disque et des permissions…", backing_up: "Sauvegarde privée et contrôle d’intégrité…",
    confirming: "Vérification de la version démarrée…",
    queued: "Mise à jour en attente…", verifying: "Vérification de la release…", downloading: "Téléchargement sécurisé…", building: "Préparation de la mise à jour…", restarting: "Redémarrage…", failed: "Échec de la mise à jour. Réessayez ou consultez le guide.", rolled_back: "L’ancienne version a été restaurée.", interrupted: "La mise à jour a été interrompue.", complete: "Mise à jour terminée.",
  } : {
    preflight: "Checking disk space and permissions…", backing_up: "Private backup and integrity check…",
    confirming: "Verifying the running version…",
    queued: "Update queued…", verifying: "Verifying release…", downloading: "Downloading securely…", building: "Preparing update…", restarting: "Restarting…", failed: "Update failed. Retry or consult the guide.", rolled_back: "The previous version was restored.", interrupted: "Update interrupted.", complete: "Update complete.",
  };
  async function update() {
    requestedAt.current = Date.now();
    setConfirming(false);
    setPending(true); setPhase("queued");
    try {
      const response = await fetch("/api/local-update", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setCheckError(publicErrorMessage(data.detail, { en: "Update could not start. Retry or open the update guide.", fr: "La mise à jour n’a pas pu démarrer. Réessayez ou ouvrez le guide." }, french ? "fr" : "en"));
        setPending(false); setPhase("failed");
      }
    } catch {
      // A lost response does not prove that queue publication failed.
      setCheckError(french ? "Demande envoyée, confirmation en attente. Vérification automatique en cours." : "Request sent; awaiting confirmation. Checking automatically.");
    }
  }
  const failureMessages: Record<string,string> = french ? {
    backup_failed: "La sauvegarde n’a pas pu être terminée. La nouvelle version n’a pas été lancée. Vérifiez l’espace disque et les permissions.",
    backup_invalid: "La sauvegarde n’a pas passé le contrôle d’intégrité. Mise à jour annulée ; conservez vos données et consultez le guide de restauration.",
    backup_database_invalid: "Le contrôle du coffre sauvegardé a échoué. Ne supprimez pas le coffre ; consultez le guide de restauration.",
    backup_unsafe_path: "Un chemin de sauvegarde n’est pas sûr. Vérifiez les liens symboliques et le propriétaire des fichiers.",
    backup_private_directory_required: "La sauvegarde doit rester privée : dossiers 700, fichiers 600, même utilisateur.",
    candidate_unhealthy: "La nouvelle version n’a pas passé le contrôle de santé. L’ancienne application a été redémarrée ; les données n’ont pas été rembobinées.",
    update_disk_space_low: "Espace disque insuffisant : libérez au moins 2 Go. L’application actuelle reste disponible.",
    update_private_directory_required: "Le dossier de mise à jour doit appartenir à votre utilisateur et rester privé (permissions 700).",
    asset_unavailable: "Téléchargement indisponible après plusieurs tentatives. Vérifiez votre connexion et réessayez.",
    asset_missing: "L’archive de cette version n’est pas disponible. Attendez sa publication complète.",
    signature_rejected: "Signature de la release refusée. Ne contournez pas cette vérification ; contactez le support.",
  } : {
    backup_failed: "Backup could not complete. The new version was not started. Check disk space and permissions.",
    backup_invalid: "Backup integrity check failed. Update cancelled; preserve your data and consult the recovery guide.",
    backup_database_invalid: "The backed-up vault failed verification. Do not delete the vault; consult the recovery guide.",
    backup_unsafe_path: "An unsafe backup path was detected. Check symbolic links and file ownership.",
    backup_private_directory_required: "Backups must remain private: directories 700, files 600, same owner.",
    candidate_unhealthy: "The new version failed its health check. The previous application restarted; data was not rewound.",
    update_disk_space_low: "Insufficient disk space: free at least 2 GB. The current application remains available.",
    update_private_directory_required: "The update directory must belong to your user and be private (permissions 700).",
    asset_unavailable: "Download unavailable after retries. Check your connection and try again.",
    asset_missing: "This release archive is not available. Wait until publication is complete.",
    signature_rejected: "Release signature rejected. Do not bypass verification; contact support.",
  };
  return <div className="local-update-actions">
    {versions.current || versions.latest ? <small>{french ? "Installée" : "Installed"} : {versions.current || "—"} · {french ? "Disponible" : "Available"} : {versions.latest || "—"}</small> : null}
    {available ? <button ref={triggerButtonRef} type="button" className="button secondary-blue" disabled={busy} onClick={() => setConfirming(true)}>{busy ? (french ? "Mise à jour en cours…" : "Updating…") : (french ? "Mettre à jour" : "Update securely")}</button> :
      <a className="button ghost" href="https://github.com/pisob/neurocheckout-community/blob/main/docs/INSTALLATION.md#upgrade" target="_blank" rel="noreferrer">{french ? "Guide de mise à jour" : "Update guide"}</a>}
    <span role="status" aria-live="polite">{labels[phase] || ""}</span>
    {checkError ? <span role="status">{checkError}</span> : null}
    {failureMessages[failureCode] ? <span role="status">{failureMessages[failureCode]}</span> : null}
    {["failed", "rolled_back", "interrupted"].includes(phase) ? <a href="https://github.com/pisob/neurocheckout-community/blob/main/docs/INSTALLATION.md#upgrade" target="_blank" rel="noreferrer">{french ? "Ouvrir le guide" : "Open the guide"}</a> : null}
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
