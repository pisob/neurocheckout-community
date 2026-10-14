"use client";
import { useEffect } from "react";

// Only the mounted view polls. A slow request cannot create overlapping timers;
// visibility/online events recover promptly without refreshing hidden tabs.
export function useEvidenceRefresh(refresh: () => Promise<void>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, running = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (stopped || running) return;
      clearTimeout(timer);
      running = true;
      try { if (document.visibilityState === "visible") await refresh(); }
      catch { /* The view owns unavailable/error presentation; keep recovery alive. */ }
      finally {
        running = false;
        if (!stopped) timer = setTimeout(() => void run(), 60_000);
      }
    };
    const wake = () => { void run(); };
    timer = setTimeout(wake, 60_000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [refresh, enabled]);
}
