import type { Metadata, Viewport } from "next";
import { Jost, Pinyon_Script } from "next/font/google";
import "./globals.css";

const jost = Jost({ subsets: ["latin", "cyrillic"], variable: "--font-jost", display: "swap" });
const script = Pinyon_Script({ subsets: ["latin"], weight: "400", variable: "--font-pinyon", display: "swap" });

export const metadata: Metadata = {
  title: "Maison De Mari — парфюмерный бутик в Ташкенте",
  description: "Распив 5 и 10 мл и флаконы под заказ: Louis Vuitton, Creed, Tom Ford, MFK, Orto Parisi и другие.",
};

export const viewport: Viewport = {
  themeColor: "#f7f4ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${jost.variable} ${script.variable}`}>
      <body>{children}</body>
    </html>
  );
}
