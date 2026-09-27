"use client";

import { useEffect, useRef } from "react";

// Digital Nirvana atmosphere: pixel rain over a perspective grid floor, drawn on a fixed canvas
// behind the page. `dim` (in-app) lowers the intensity so content stays readable; on the login,
// choice, and wizard screens the rain fades toward the center card instead. Honors
// prefers-reduced-motion by drawing a single still frame.
export function NirvanaBackdrop({ dim }: { dim: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimRef = useRef(dim);
  dimRef.current = dim;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CELL = 16, GAP = 2, STEP = CELL + GAP;
    type Drop = { x: number; y: number; speed: number; len: number; orange: boolean; flicker: number };
    let W = 0, H = 0, drops: Drop[] = [], raf = 0, last = 0;

    const makeDrop = (x: number, anywhere: boolean): Drop => ({
      x, y: anywhere ? Math.random() * H : -Math.random() * H * 0.8,
      speed: 50 + Math.random() * 180, len: 4 + Math.floor(Math.random() * 12),
      orange: Math.random() < 0.06, flicker: Math.random()
    });
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = [];
      for (let c = 0; c < Math.ceil(W / STEP); c++) if (Math.random() < 0.6) drops.push(makeDrop(c * STEP, true));
    }
    function fade(x: number, y: number) {
      if (dimRef.current) return 1;
      const dx = (x - W / 2) / (W * 0.34), dy = (y - H / 2) / (H * 0.44), d = Math.sqrt(dx * dx + dy * dy);
      return d < 1 ? 0.2 + 0.8 * d : 1;
    }
    function rain(dt: number, t: number) {
      const intensity = dimRef.current ? 0.18 : 1;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.y += d.speed * dt;
        const head = Math.floor(d.y / STEP);
        for (let j = 0; j < d.len; j++) {
          const cy = (head - j) * STEP;
          if (cy < -CELL || cy > H) continue;
          const k = fade(d.x, cy) * intensity, fall = 1 - j / d.len;
          const a = fall * fall * (0.75 + 0.25 * Math.sin(t / 90 + d.flicker * 40 + j)) * 0.5 * k;
          if (j === 0) {
            ctx!.fillStyle = d.orange ? `rgba(255,190,130,${0.9 * k})` : `rgba(230,255,255,${0.9 * k})`;
            ctx!.shadowColor = d.orange ? "#FF7A1A" : "#00E5FF";
            ctx!.shadowBlur = 12 * k;
          } else {
            ctx!.fillStyle = d.orange ? `rgba(255,122,26,${a})` : `rgba(0,229,255,${a})`;
            ctx!.shadowBlur = 0;
          }
          ctx!.fillRect(d.x, cy, CELL, CELL);
        }
        ctx!.shadowBlur = 0;
        if ((head - d.len) * STEP > H) drops[i] = makeDrop(d.x, false);
      }
    }
    function floor(t: number) {
      const horizon = H * 0.74, cx = W / 2, k = Math.max(dimRef.current ? 0.18 : 1, 0.5);
      const g = ctx!.createLinearGradient(0, horizon - 40, 0, horizon + 10);
      g.addColorStop(0, "rgba(0,229,255,0)");
      g.addColorStop(1, `rgba(0,229,255,${0.25 * k})`);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, horizon - 40, W, 50);
      ctx!.strokeStyle = `rgba(0,229,255,${0.45 * k})`;
      ctx!.lineWidth = 1.5;
      ctx!.beginPath(); ctx!.moveTo(0, horizon); ctx!.lineTo(W, horizon); ctx!.stroke();
      ctx!.lineWidth = 1;
      for (let i = -14; i <= 14; i++) {
        ctx!.strokeStyle = `rgba(0,229,255,${Math.max(0.26 - Math.abs(i) * 0.012, 0.04) * k})`;
        ctx!.beginPath(); ctx!.moveTo(cx + i * 26, horizon); ctx!.lineTo(cx + i * W * 0.16, H + 40); ctx!.stroke();
      }
      const scroll = reduced ? 0 : (t / 1600) % 1;
      for (let r = 0; r < 12; r++) {
        const p = (r + scroll) / 12;
        ctx!.strokeStyle = `rgba(0,229,255,${(0.05 + p * 0.28) * k})`;
        const y = horizon + Math.pow(p, 2.2) * (H - horizon + 40);
        ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(W, y); ctx!.stroke();
      }
    }
    function still() {
      ctx!.fillStyle = "#020409"; ctx!.fillRect(0, 0, W, H);
      floor(0); rain(0, 0);
    }
    function frame(t: number) {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      ctx!.fillStyle = "rgba(2,4,9,.32)"; ctx!.fillRect(0, 0, W, H);
      floor(t); rain(dt, t);
      raf = requestAnimationFrame(frame);
    }
    function onResize() { size(); if (reduced) still(); }
    size();
    addEventListener("resize", onResize);
    if (reduced) still(); else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={canvasRef} className="nirvana-grid" aria-hidden="true" />;
}
