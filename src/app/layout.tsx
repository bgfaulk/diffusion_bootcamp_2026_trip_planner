import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Caveat, Orbitron, Share_Tech_Mono } from "next/font/google";
import { FX_KEY, THEME_KEY } from "@/lib/theme";
import { Toaster } from "./toast";

// Display + body faces for the Digital Nirvana theme. Loaded here so the CSS variables exist on
// <html>; the other themes keep the system font stack.
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-display-nirvana", display: "swap" });
const shareTechMono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono-nirvana", display: "swap" });
// Handwriting face for the login page's masthead line.
const caveat = Caveat({ weight: "500", subsets: ["latin"], variable: "--font-script", display: "swap" });

// Explicit so the phone layout's safe-area insets (env()) apply; pinch zoom stays available.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "San Francisco trip planning dashboard"
};

// Applies the remembered theme before first paint so there is no flash of the light theme.
const themeBoot = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||t==="nirvana")document.documentElement.dataset.theme=t;if(localStorage.getItem(${JSON.stringify(FX_KEY)})==="off")document.documentElement.dataset.fx="off"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${shareTechMono.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}<Toaster /></body>
    </html>
  );
}
