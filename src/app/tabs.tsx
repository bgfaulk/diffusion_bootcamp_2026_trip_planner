"use client";

import { KeyboardEvent, useEffect } from "react";

export type Tab<K extends string> = { key: K; label: string; count?: number };

// Segmented switcher for pages that hold several panels; only the active panel renders.
export function Tabs<K extends string>({ tabs, active, onChange, label }: { tabs: Tab<K>[]; active: K; onChange: (key: K) => void; label: string }) {
  // On phones the strip scrolls sideways; keep the active tab in view.
  useEffect(() => { document.getElementById(`tab-${active}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex(tab => tab.key === active);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          id={`tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          tabIndex={active === tab.key ? 0 : -1}
          className={active === tab.key ? "active" : ""}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="tab-panel">{children}</div>;
}
