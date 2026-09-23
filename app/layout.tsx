import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Self-hosted at build time by next/font; the browser never contacts Google.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
export const metadata: Metadata = {
  title: "Semester · Dein Lerncockpit",
  description:
    "Dein Semester im Blick. Lernpläne, Wissenslücken und nachgewiesener Fortschritt an einem Ort.",
  icons: { icon: { url: "/semester-icon.png", type: "image/png", sizes: "64x64" } },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
