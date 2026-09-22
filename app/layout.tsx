import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Semester · Dein Lerncockpit",
  description:
    "Dein Semester im Blick. Lernpläne, Wissenslücken und nachgewiesener Fortschritt an einem Ort.",
  icons: { icon: { url: "/semester-icon.png", type: "image/png", sizes: "64x64" } },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
