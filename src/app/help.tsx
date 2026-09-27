"use client";

import { CSSProperties, useEffect, useId, useRef, useState } from "react";

// The "?" beside a field label. A title attribute only shows on hover, which touch screens never do, so
// this is a button: tap or focus it to show the note, tap again, tap elsewhere, or press Escape to hide it.
// Mouse users still get it on hover. The note opens toward whichever side of the screen has more room.
export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  function measure() {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const roomRight = window.innerWidth - rect.left - 16;
    const roomLeft = rect.right - 16;
    setPlace(roomRight >= roomLeft ? { left: 0, right: "auto", maxWidth: Math.min(300, roomRight) } : { left: "auto", right: 0, maxWidth: Math.min(300, roomLeft) });
  }
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) { if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false); }
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  return (
    <span className={open ? "help-wrap open" : "help-wrap"} ref={wrap} onMouseEnter={measure}>
      <button type="button" className="help" aria-label="More about this field" aria-expanded={open} aria-describedby={id} onFocus={measure} onClick={event => { event.preventDefault(); event.stopPropagation(); measure(); setOpen(value => !value); }}>?</button>
      <span className="help-tip" role="tooltip" id={id} style={place}>{text}</span>
    </span>
  );
}
