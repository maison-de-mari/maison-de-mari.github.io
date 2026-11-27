"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Верхняя строка сайта — закреплена и едет вместе со страницей:
 * слева логотип, справа кнопки «Витрина» (3D-кольцо наверху), «Все ароматы» (полки) и корзина.
 * Кнопка раздела, где сейчас находится посетитель, подсвечена золотом.
 * Когда страница прокручена, под строкой появляется мягкая подложка цвета бумаги — текст не сливается с флаконами.
 */
export function SiteNav() {
  const [where, setWhere] = useState<"ring" | "shelf">("ring");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => {
      const shelf = document.getElementById("shelf");
      const y = window.scrollY;
      setScrolled(y > 24);
      setWhere(shelf && y + window.innerHeight * 0.4 >= shelf.offsetTop ? "shelf" : "ring");
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  const go = (id: "top" | "shelf") => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = id === "top" ? 0 : (document.getElementById("shelf")?.offsetTop ?? 0);
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav aria-label="Разделы сайта" className="pointer-events-none fixed inset-x-0 top-0 z-40">
      {/* подложка при прокрутке */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#f1efea] via-[#f1efea]/80 to-transparent transition-opacity duration-500 ${scrolled ? "opacity-100" : "opacity-0"}`}
      />
      <div className="relative flex items-center justify-between gap-2 px-3 pt-3 sm:px-8 sm:pt-6">
        <a href={`${BASE}/`} onClick={(e) => (e.preventDefault(), go("top"))} className="pointer-events-auto shrink-0 font-script text-[1.08rem] leading-none min-[380px]:text-[1.3rem] min-[420px]:text-[1.5rem] text-gold sm:text-[2.4rem]">
          Maison De Mari
        </a>
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2.5">
          <Pill active={where === "ring"} onClick={() => go("top")}>
            Витрина
          </Pill>
          <Pill active={where === "shelf"} onClick={() => go("shelf")}>
            <span className="sm:hidden">Ароматы</span>
            <span className="hidden sm:inline">Все ароматы</span>
          </Pill>
          <CartPill />
        </div>
      </div>
    </nav>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`relative inline-flex h-9 items-center rounded-full px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] ring-1 transition-[color,box-shadow,background-color] duration-300 sm:h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.22em] ${
        active ? "bg-white text-gold ring-gold/60" : "bg-white/85 text-ink ring-ink/15 hover:text-gold hover:ring-gold/40"
      }`}
    >
      {children}
    </button>
  );
}

function CartPill() {
  const items = useCart();
  const n = items.length;
  return (
    <motion.span
      key={n}
      initial={false}
      animate={n ? { y: [0, -4, 1, 0] } : undefined}
      transition={{ duration: 0.6, ease: [0.3, 1.6, 0.5, 1] }}
      aria-live="polite"
      aria-label={`Корзина: ${n}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/85 pl-2 pr-1 text-[10px] font-medium uppercase tracking-[0.1em] ring-1 ring-ink/15 sm:h-10 sm:gap-2.5 sm:pl-4 sm:pr-1.5 sm:text-[11px] sm:tracking-[0.22em]"
    >
      {/* на телефоне — значок сумки вместо слова */}
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <span className="hidden sm:inline">Корзина</span>
      <span className="relative grid h-7 min-w-7 place-items-center overflow-hidden rounded-full bg-gold px-2 text-xs font-semibold tracking-normal text-night tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={n}
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-110%", opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1.2] }}
          >
            {n}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  );
}

export default SiteNav;
