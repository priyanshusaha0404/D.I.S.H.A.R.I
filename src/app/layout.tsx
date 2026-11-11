import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";

export const metadata: Metadata = {
  title: { default: "D.I.S.H.A.R.I — Sundarbans smart trip", template: "%s · D.I.S.H.A.R.I" },
  description: "Plan boat and walking trips across the Indian Sundarbans with tides, ghats and live 3D tracking, see every block in detail, and let the assistant do the work — in English and Bengali, online and offline.",
  applicationName: "D.I.S.H.A.R.I",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "D.I.S.H.A.R.I", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0a0f1e" }, { media: "(prefers-color-scheme: dark)", color: "#0a0f1e" }],
};

// theme is applied before first paint to avoid a flash
const themeScript = `try{var t=localStorage.getItem('dishari.theme');if(t!=='light')document.documentElement.classList.add('dark');var l=localStorage.getItem('dishari.lang');if(l)document.documentElement.lang=l;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&display=swap" /></head>
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
