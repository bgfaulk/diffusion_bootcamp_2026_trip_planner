"use client";

import { useEffect, useState } from "react";

// Small, app-wide "it worked" / "it didn't" messages. Any module calls notify.success("Settings saved") or
// notify.error(err); the <Toaster /> in the layout shows them bottom-center for a few seconds. Errors stay
// longer and can be dismissed. Kept as a module-level store so forms in any file can use it without context.

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; kind: "success" | "error" | "info"; text: string; action?: ToastAction };
type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() { for (const listener of listeners) listener(toasts); }
function dismiss(id: number) { toasts = toasts.filter(toast => toast.id !== id); emit(); }
function push(kind: Toast["kind"], text: string, action?: ToastAction) {
  const id = nextId++;
  toasts = [...toasts.filter(toast => toast.text !== text), { id, kind, text, action }];
  emit();
  // Info toasts carry something to do (such as reloading after a deploy), so they stay until dismissed.
  if (kind !== "info") setTimeout(() => dismiss(id), kind === "error" ? 8000 : 3200);
}

export const notify = {
  success(text: string) { push("success", text); },
  error(error: unknown, fallback = "That didn't save") { push("error", error instanceof Error && error.message ? error.message : fallback); },
  info(text: string, action?: ToastAction) { push("info", text, action); }
};

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => { listeners.add(setList); setList(toasts); return () => { listeners.delete(setList); }; }, []);
  if (!list.length) return null;
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {list.map(toast => (
        <div key={toast.id} className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{toast.kind === "success" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : toast.kind === "info" ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></> : <path d="M12 8v5M12 16.5v.5M4.5 19h15L12 5z" />}</svg>
          <span>{toast.text}</span>
          {toast.action && <button type="button" className="toast-action" onClick={toast.action.run}>{toast.action.label}</button>}
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
