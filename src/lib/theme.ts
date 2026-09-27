// Theme preferences shared by the settings API and the client shell.
// The chosen theme lives in settings (per account) and is mirrored to localStorage so the
// login screen and the first paint can honor it before bootstrap finishes.
export const THEMES = ["light", "dark", "nirvana"] as const;
export type Theme = (typeof THEMES)[number];
export const themeLabels: Record<Theme, string> = { light: "Light", dark: "Dark", nirvana: "Digital Nirvana" };

export const THEME_KEY = "trip-theme";
export const FX_KEY = "trip-grid-fx";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

// "Grid effects" (pixel rain, floor grid, scanlines) is a per-device choice, not an account setting.
export function storedFx(): boolean {
  try { return localStorage.getItem(FX_KEY) !== "off"; } catch { return true; }
}

export function applyFx(on: boolean) {
  document.documentElement.dataset.fx = on ? "on" : "off";
  try { localStorage.setItem(FX_KEY, on ? "on" : "off"); } catch {}
}
