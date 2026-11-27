import type { Metadata, Viewport } from "next";
import { Jost, Pinyon_Script, Tinos } from "next/font/google";
import "./globals.css";

const jost = Jost({ subsets: ["latin", "cyrillic"], variable: "--font-jost", display: "swap" });
// заголовки — классический Times (как PS Times на immersive-g.com): системный Times New Roman, а где его нет (Android) — Tinos
const serif = Tinos({ subsets: ["latin", "cyrillic"], weight: "400", variable: "--font-tinos", display: "swap", preload: false });
const script = Pinyon_Script({ subsets: ["latin"], weight: "400", variable: "--font-pinyon", display: "swap" });

const THEME_SCRIPT = `try{if(localStorage.getItem("mdm-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

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
    <html lang="ru" className={`${jost.variable} ${serif.variable} ${script.variable}`} suppressHydrationWarning>
      <head>
        {/* тема — до первой отрисовки, чтобы тёмная не мигала светлой */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
