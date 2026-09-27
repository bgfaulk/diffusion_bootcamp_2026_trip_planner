import { ImageResponse } from "next/og";

// The ABC mark as a tab icon: the three lit letters over the word FITNESS, on the loader's dark stage, the
// same as the login card and sidebar logo. Rendered to PNG by next/og so every browser gets it (Safari
// ignores SVG favicons). Favicons can't animate in Chrome or Safari, so this is the "all lit" frame of the
// bumper: each FITNESS letter takes the peacock color of its third, like the word under the loader.
const letters: [string, string][] = [["A", "#fcb711"], ["B", "#f37021"], ["C", "#0089d0"]];
const peacock = ["#fcb711", "#f37021", "#cc004c", "#6460aa", "#0089d0", "#0db14b"];
const fitness = "FITNESS".split("");

// Inter Black from Google Fonts, fetched once at build so the letters are as heavy as the app's. If the
// fetch fails the default font still draws a readable icon.
async function heavyFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@900&text=ABCFITNES", { headers: { "User-Agent": "Mozilla/5.0" } }).then(r => r.text());
    const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype|woff)'\)/.exec(css)?.[1];
    return url ? await fetch(url).then(r => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function abcIcon(size: number) {
  const font = await heavyFont();
  const unit = size / 64;
  const family = font ? "Inter" : "sans-serif";
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 * unit, background: "#060a12", borderRadius: 14 * unit }}>
        <div style={{ display: "flex", gap: 3 * unit, fontFamily: family, fontWeight: 900, fontSize: 24 * unit, lineHeight: 1, letterSpacing: -0.5 * unit }}>
          {letters.map(([letter, color]) => <span key={letter} style={{ color }}>{letter}</span>)}
        </div>
        <div style={{ display: "flex", gap: 0.6 * unit, fontFamily: family, fontWeight: 900, fontSize: 7.5 * unit, lineHeight: 1 }}>
          {fitness.map((letter, index) => <span key={index} style={{ color: peacock[Math.min(index, peacock.length - 1)] }}>{letter}</span>)}
        </div>
      </div>
    ),
    { width: size, height: size, ...(font ? { fonts: [{ name: "Inter", data: font, weight: 900, style: "normal" }] } : {}) }
  );
}
