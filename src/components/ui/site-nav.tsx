"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { MOODS, type Mood } from "@/data/moods";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const MOOD_TITLE: Record<Mood, string> = {
  floral: "Цветочные",
  gourmand: "Гурманские",
  woody: "Древесные",
  fresh: "Свежие",
};

type Where = "ring" | "shelf" | Mood;

/**
 * Меню сайта — закреплено и едет вместе со страницей.
 * Компьютер: слева логотип, справа — окно-меню, пункты сверху вниз:
 *   Витрина (3D-кольцо) → Все ароматы → полки по настроениям → Корзина.
 * Телефон и узкий ноутбук (< 1280 px): те же разделы строкой кнопок («Витрина», «Ароматы», корзина).
 * Раздел, где сейчас посетитель, подсвечен золотом.
 */
export function SiteNav() {
  const [where, setWhere] = useState<Where>("ring");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      const line = y + window.innerHeight * 0.4;
      setScrolled(y > 24);
      const shelf = document.getElementById("shelf");
      if (!shelf || line < shelf.offsetTop) return setWhere("ring");
      let w: Where = "shelf";
      for (const m of MOODS) {
        const el = document.getElementById(`mood-${m}`);
        if (el && line >= el.getBoundingClientRect().top + y) w = m;
      }
      setWhere(w);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  const go = (id: "top" | "shelf" | Mood) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = id === "top" ? null : document.getElementById(id === "shelf" ? "shelf" : `mood-${id}`);
    const top = el ? el.getBoundingClientRect().top + window.scrollY - (id === "shelf" ? 0 : 96) : 0;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };

  const inShelf = where !== "ring";

  return (
    <nav aria-label="Разделы сайта" className="pointer-events-none fixed inset-x-0 top-0 z-40">
      {/* подложка при прокрутке — чтобы логотип и кнопки не сливались с флаконами */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#f1efea] via-[#f1efea]/80 to-transparent transition-opacity duration-500 sm:h-28 sm:w-[24rem] sm:bg-[radial-gradient(70%_100%_at_0%_0%,#f1efea,transparent)] ${scrolled ? "opacity-100" : "opacity-0"}`}
      />
      <div className="relative flex items-start justify-between gap-2 px-3 pt-3 sm:px-8 sm:pt-6">
        <a
          href={`${BASE}/`}
          onClick={(e) => (e.preventDefault(), go("top"))}
          className="pointer-events-auto shrink-0 pt-2 font-script text-[1.08rem] leading-none text-gold min-[380px]:text-[1.3rem] min-[420px]:text-[1.5rem] sm:pt-1 sm:text-[2.4rem]"
        >
          Maison De Mari
        </a>

        {/* телефон и узкий ноутбук: строка кнопок */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 xl:hidden">
          <Pill active={!inShelf} onClick={() => go("top")}>
            Витрина
          </Pill>
          <Pill active={inShelf} onClick={() => go("shelf")}>
            Ароматы
          </Pill>
          <CartPill />
        </div>

        {/* широкий экран: окно-меню, пункты сверху вниз (на узком оно закрывало бы правый ряд флаконов) */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto hidden w-[12.5rem] rounded-2xl bg-white/75 p-1.5 shadow-[0_20px_44px_-22px_rgba(70,45,20,0.45)] ring-1 ring-ink/10 backdrop-blur-md xl:block"
        >
          <Row active={where === "ring"} onClick={() => go("top")}>
            Витрина
          </Row>
          <Row active={where === "shelf"} onClick={() => go("shelf")}>
            Все ароматы
          </Row>
          <ul className="mb-1 ml-4 border-l border-gold/30 pl-1">
            {MOODS.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => go(m)}
                  aria-current={where === m ? "true" : undefined}
                  className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left font-serif text-[15px] leading-none transition-colors duration-300 ${
                    where === m ? "text-gold" : "text-ink/75 hover:text-gold"
                  }`}
                >
                  <span aria-hidden className={`size-1 rounded-full transition-colors ${where === m ? "bg-gold" : "bg-transparent"}`} />
                  {MOOD_TITLE[m]}
                </button>
              </li>
            ))}
          </ul>
          <div aria-hidden className="mx-3 h-px bg-ink/10" />
          <CartRow />
        </motion.div>
      </div>
    </nav>
  );
}

/** пункт окна-меню: золотая точка и золотой текст у текущего раздела */
function Row({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex h-10 w-full items-center justify-between rounded-xl px-3.5 text-[11px] font-medium uppercase tracking-[0.22em] transition-colors duration-300 ${
        active ? "bg-gold/10 text-gold" : "text-ink hover:bg-ink/[0.04] hover:text-gold"
      }`}
    >
      {children}
      <span aria-hidden className={`size-1.5 rounded-full transition-colors ${active ? "bg-gold" : "bg-transparent"}`} />
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`relative inline-flex h-9 items-center rounded-full px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] ring-1 transition-[color,box-shadow,background-color] duration-300 ${
        active ? "bg-white text-gold ring-gold/60" : "bg-white/85 text-ink ring-ink/15"
      }`}
    >
      {children}
    </button>
  );
}

/** число в корзине: подпрыгивает и перелистывается, когда меняется */
function Count({ n }: { n: number }) {
  return (
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
  );
}

function CartRow() {
  const n = useCart().length;
  return (
    <motion.div
      key={n}
      initial={false}
      animate={n ? { y: [0, -3, 1, 0] } : undefined}
      transition={{ duration: 0.6, ease: [0.3, 1.6, 0.5, 1] }}
      aria-live="polite"
      aria-label={`Корзина: ${n}`}
      className="mt-1 flex h-11 items-center justify-between rounded-xl pl-3.5 pr-1.5 text-[11px] font-medium uppercase tracking-[0.22em]"
    >
      Корзина
      <Count n={n} />
    </motion.div>
  );
}

function CartPill() {
  const n = useCart().length;
  return (
    <motion.span
      key={n}
      initial={false}
      animate={n ? { y: [0, -4, 1, 0] } : undefined}
      transition={{ duration: 0.6, ease: [0.3, 1.6, 0.5, 1] }}
      aria-live="polite"
      aria-label={`Корзина: ${n}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/85 pl-2 pr-1 ring-1 ring-ink/15"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <Count n={n} />
    </motion.span>
  );
}

export default SiteNav;
