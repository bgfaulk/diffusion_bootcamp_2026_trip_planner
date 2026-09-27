"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Signs people out after an hour without activity, with a two-minute warning first. Activity is any pointer,
// key, scroll, or touch anywhere on the page. The last-active time is shared through localStorage so a person
// working in one tab isn't signed out by an idle second tab, and so the check survives a laptop sleeping:
// the clock is compared on every tick and when the tab becomes visible again, not counted with a timer.

const IDLE_LIMIT_MS = 60 * 60 * 1000;
const WARN_BEFORE_MS = 2 * 60 * 1000;
const KEY = "trip-last-active";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;

function readShared(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
function writeShared(at: number) {
  try { localStorage.setItem(KEY, String(at)); } catch {}
}

export function useIdleTimeout(active: boolean, onTimeout: () => void) {
  // null = no warning showing; a number = seconds until sign-out.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warning = useRef(false);
  const lastLocal = useRef(0);
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;

  useEffect(() => {
    if (!active) { warning.current = false; setSecondsLeft(null); return; }
    let fired = false;
    const touch = () => { lastLocal.current = Date.now(); writeShared(lastLocal.current); };
    touch();
    // While the warning is up, only the "Stay signed in" button counts, so a nudge of the mouse can't dismiss
    // it unseen. Otherwise activity is recorded at most every few seconds.
    const onActivity = () => { if (!warning.current && Date.now() - lastLocal.current > 5000) touch(); };
    const tick = () => {
      if (fired) return;
      // The shared clock is the truth (every tab writes it); the in-memory copy covers browsers without storage.
      const last = readShared() || lastLocal.current;
      const idle = Date.now() - last;
      if (idle >= IDLE_LIMIT_MS) { fired = true; warning.current = false; setSecondsLeft(null); timeout.current(); return; }
      if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) { warning.current = true; setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000)); return; }
      if (warning.current) { warning.current = false; setSecondsLeft(null); } // another tab chose to stay signed in
    };
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(tick, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [active]);

  const stay = useCallback(() => {
    lastLocal.current = Date.now();
    writeShared(lastLocal.current);
    warning.current = false;
    setSecondsLeft(null);
  }, []);

  return { secondsLeft, stay };
}

export function IdleWarning({ secondsLeft, onStay, onSignOut }: { secondsLeft: number; onStay: () => void; onSignOut: () => void }) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-copy">
      <section className="modal confirm-modal">
        <p className="eyebrow">Still there?</p>
        <h2 id="idle-title">You&apos;ll be signed out in <span className="idle-count">{minutes}:{seconds}</span></h2>
        <p id="idle-copy">After an hour without activity you&apos;re signed out, so your trip details aren&apos;t left open on a shared screen.</p>
        <div className="button-row">
          <button className="btn primary" onClick={onStay} autoFocus>Stay signed in</button>
          <button className="btn" onClick={onSignOut}>Sign out now</button>
        </div>
      </section>
    </div>
  );
}
