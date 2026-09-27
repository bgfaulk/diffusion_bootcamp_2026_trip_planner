"use client";

import { useEffect, useRef, useState } from "react";
import { formatWindowLong, MAX_WINDOW_MINUTES, QUICK_RANGES, REFRESH_INTERVALS, stepWindow, WINDOW_UNITS, windowMinutes, windowParts, zoomOutWindow, type WindowUnit } from "@/lib/time-window";

// The trailing-window pill from revari-crm's Settings > Operations page: step wider, the picker (quick ranges
// plus a custom value and unit), step narrower, zoom out. Every window here follows the clock.
export function TimeWindowPill({ minutes, onChange, disabled = false, maxMinutes = MAX_WINDOW_MINUTES }: { minutes: number; onChange: (minutes: number) => void; disabled?: boolean; maxMinutes?: number }) {
  const [open, setOpen] = useState(false);
  const parts = windowParts(minutes);
  const [customValue, setCustomValue] = useState(String(parts.value));
  const [customUnit, setCustomUnit] = useState<WindowUnit>(parts.unit);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { const next = windowParts(minutes); setCustomValue(String(next.value)); setCustomUnit(next.unit); }, [minutes]);
  useOutsideClose(root, open, () => setOpen(false));

  const clamp = (value: number) => Math.min(Math.max(value, 1), maxMinutes);
  const apply = (value: number) => { setOpen(false); onChange(clamp(value)); };
  const applyCustom = () => { const value = Number(customValue); if (Number.isFinite(value) && value > 0) apply(windowMinutes(value, customUnit)); };
  const quick = QUICK_RANGES.filter(range => range.minutes <= maxMinutes);
  const atMax = minutes >= maxMinutes, atMin = minutes <= QUICK_RANGES[0].minutes;

  return (
    <div className="window-pill" ref={root}>
      <button type="button" className="pill-icon" title="Wider window (look further back)" aria-label="Wider window" disabled={disabled || atMax} onClick={() => apply(stepWindow(minutes, 1))}><Icon d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></button>
      <button type="button" className="pill-main" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />{formatWindowLong(minutes)}<Icon d="M6 9l6 6 6-6" small />
      </button>
      <button type="button" className="pill-icon" title="Narrower window" aria-label="Narrower window" disabled={disabled || atMin} onClick={() => apply(stepWindow(minutes, -1))}><Icon d="M13 17l5-5-5-5M6 17l5-5-5-5" /></button>
      <button type="button" className="pill-icon" title="Zoom out (double the window)" aria-label="Zoom out" disabled={disabled || atMax} onClick={() => apply(zoomOutWindow(minutes))}><Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11h6" /></button>
      {open && (
        <div className="pill-menu" role="menu" aria-label="Time window">
          <div className="pill-ranges">
            {quick.map(range => <button type="button" role="menuitemradio" aria-checked={minutes === range.minutes} key={range.minutes} className={minutes === range.minutes ? "on" : ""} onClick={() => apply(range.minutes)}>{range.label}</button>)}
          </div>
          <div className="pill-custom">
            <span className="eyebrow">Custom window</span>
            <div>
              <input type="number" min={1} value={customValue} aria-label="Custom window value" onChange={event => setCustomValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyCustom(); } }} />
              <select value={customUnit} aria-label="Custom window unit" onChange={event => setCustomUnit(event.target.value as WindowUnit)}>{WINDOW_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
              <button type="button" className="btn primary" disabled={disabled} onClick={applyCustom}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Refresh split pill: a refresh button and an auto-refresh cadence.
export function RefreshControl({ refreshing, onRefresh, seconds, onSeconds, updatedAt }: { refreshing: boolean; onRefresh: () => void; seconds: number | null; onSeconds: (seconds: number | null) => void; updatedAt: Date | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useOutsideClose(root, open, () => setOpen(false));
  const label = REFRESH_INTERVALS.find(interval => interval.seconds === seconds)?.label ?? "Off";
  return (
    <div className="window-pill" ref={root} title={updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-US")}` : undefined}>
      <button type="button" className="pill-main" disabled={refreshing} onClick={onRefresh}><Icon d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" spin={refreshing} />{refreshing ? "Refreshing..." : "Refresh"}</button>
      <button type="button" className="pill-main pill-interval" aria-haspopup="menu" aria-expanded={open} aria-label="Auto-refresh interval" onClick={() => setOpen(value => !value)}>{label}<Icon d="M6 9l6 6 6-6" small /></button>
      {open && (
        <div className="pill-menu narrow" role="menu" aria-label="Auto-refresh interval">
          <div className="pill-ranges">
            {REFRESH_INTERVALS.map(interval => <button type="button" role="menuitemradio" aria-checked={interval.seconds === seconds} key={interval.label} className={interval.seconds === seconds ? "on" : ""} onClick={() => { onSeconds(interval.seconds); setOpen(false); }}>{interval.label}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function useOutsideClose(root: React.RefObject<HTMLDivElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, root, close]);
}

function Icon({ d, small = false, spin = false }: { d: string; small?: boolean; spin?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`pill-svg ${small ? "small" : ""} ${spin ? "spin" : ""}`}><path d={d} /></svg>;
}
