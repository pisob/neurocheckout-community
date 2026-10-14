"use client";

import { useEffect, useState } from "react";
import type { SponsorImage as ImageDescriptor } from "@/lib/community-funding";
import type { UiLanguage } from "@/lib/ui-language";

export default function SponsorImage({ image, href, language }: { image: ImageDescriptor; href: string; language: UiLanguage }) {
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failedAnimation, setFailedAnimation] = useState(false);
  const [failed, setFailed] = useState(false);
  const ui = (en: string, fr: string) => language === "fr" ? fr : en;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (failed) return null;
  const moving = image.animated && !reduced && !paused && !failedAnimation;
  const src = `/api/cloud/community-funding/media/${image.asset_id}/${moving ? "image" : "poster"}.webp`;
  return <div className="community-sponsor-media">
    <a href={href} target="_blank" rel="sponsored noopener noreferrer" referrerPolicy="no-referrer">
      {/* Native image deliberately switches to a separate still file to stop GIF/WebP animation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={language === "fr" ? image.alt_fr : image.alt_en} width={image.width} height={image.height}
        loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => moving ? setFailedAnimation(true) : setFailed(true)} />
      <span className="funding-sr-only">{ui(" (opens in a new tab)", " (nouvel onglet)")}</span>
    </a>
    {image.animated && !reduced && !failedAnimation ? <button type="button" className="funding-animation-toggle" aria-pressed={paused}
      onClick={() => setPaused(!paused)}>{paused ? ui("Play animation", "Lire l’animation") : ui("Pause animation", "Mettre l’animation en pause")}</button> : null}
  </div>;
}
