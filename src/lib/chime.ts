// The three-note chime that plays as the A, B, C letters light up on the loader, synthesized with the
// Web Audio API (no audio file). Browsers only let sound start after the person has interacted with the
// page, so `primeChime()` is called from click/submit handlers and the loader offers a tap when it's blocked.
//
// On/off lives in two places: this device (localStorage, so the boot loader knows before any data arrives)
// and the account (settings.chime_muted, mirrored onto the device whenever settings load). Unset means on.

import { api } from "./client";

const KEY = "trip-chime";
let ctx: AudioContext | null = null;

export function chimeEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setChimeEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
}

// Save the choice to the account too. Fire-and-forget: the device copy is already updated, and this fails
// quietly when there's no session (the boot loader can show before we know whether the login still holds).
export function saveChimeEnabled(on: boolean) {
  setChimeEnabled(on);
  void api("/api/settings", { method: "PATCH", body: JSON.stringify({ chimeMuted: !on }) }).catch(() => {});
}

// Create or resume the audio context. Only works from inside a user gesture the first time.
export function primeChime() {
  if (typeof window === "undefined") return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

export function chimeReady(): boolean {
  return Boolean(ctx && ctx.state === "running");
}

// A4, B4, C5: each letter plays its own note, three ascending scale steps. Bell-like tone: a few decaying
// partials that ring together.
const NOTES = [440, 493.88, 523.25];
const PARTIALS: [number, number][] = [[1, 1], [2, 0.3], [3, 0.12], [4.2, 0.05], [1.003, 0.4]];
// A web page can't read or change the speaker volume, so "75%" means the loudest sample of a note is 75%
// of what the browser could output at the current volume. The partials are scaled so their sum peaks there.
const VOLUME = 0.75;
const PEAK = VOLUME / PARTIALS.reduce((sum, [, level]) => sum + level, 0);

export function playChimeNote(index: number): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const freq = NOTES[index] ?? NOTES[0];
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(PEAK, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 3);
  for (const [ratio, level] of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 3.2);
  }
  return true;
}
