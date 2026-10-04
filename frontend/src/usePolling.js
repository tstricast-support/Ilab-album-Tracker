import { useEffect, useRef } from "react";
import { POLL_INTERVAL_MS } from "./config.js";

export function usePolling(fn, ms = POLL_INTERVAL_MS, enabled = true, resetKey = null) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; });

  useEffect(() => {
    if (!enabled) return;
    let t = null;
    const run = () => saved.current();
    const start = () => { if (!t) t = setInterval(run, ms); };
    const stop = () => { clearInterval(t); t = null; };
    const onVis = () => {
      if (document.hidden) stop();
      else { run(); start(); }
    };
    run();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled, resetKey]);
}