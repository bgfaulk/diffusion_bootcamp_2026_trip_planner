// The three-note chime that plays as the A, B, C letters light up on the loader, synthesized with the
// Web Audio API (no audio file). Browsers only let sound start after the person has interacted with the
// page, so `primeChime()` is called from click/submit handlers and the loader offers a tap when it's blocked.

const KEY = "trip-chime";
let ctx: AudioContext | null = null;

export function chimeEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setChimeEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
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

// G4, E4, C5: one note per letter. Bell-like tone: a few decaying partials that ring together.
const NOTES = [392, 329.63, 523.25];

export function playChimeNote(index: number): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const freq = NOTES[index] ?? NOTES[0];
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 3);
  const partials: [number, number][] = [[1, 1], [2, 0.3], [3, 0.12], [4.2, 0.05], [1.003, 0.4]];
  for (const [ratio, level] of partials) {
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
