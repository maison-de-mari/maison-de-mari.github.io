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

const RAIL: { id: "ring" | Mood; label: string }[] = [{ id: "ring", label: "Витрина" }, ...MOODS.map((m) => ({ id: m, label: MOOD_TITLE[m] }))];

/**
 * Меню сайта — закреплено и едет вместе со страницей.
 * Компьютер (≥ 1024 px): слева логотип, справа — узкая линейка: корзина, под ней разделы сверху вниз точками
 *   (Витрина, затем полки по настроениям); подписи — при наведении и коротко при смене раздела.
 * Телефон и планшет: те же разделы строкой кнопок («Витрина», «Ароматы», корзина).
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
  // в начале полок (до первого настроения) отмечаем первую полку
  const mark: "ring" | Mood = where === "shelf" ? MOODS[0] : where;
  // при смене раздела его название коротко показывается рядом с линейкой
  const [flash, setFlash] = useState<"ring" | Mood | null>(null);
  const [seen, setSeen] = useState(mark);
  if (seen !== mark) {
    setSeen(mark);
    setFlash(mark);
  }
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

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

        {/* телефон и планшет: строка кнопок */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 lg:hidden">
          <Pill active={!inShelf} onClick={() => go("top")}>
            Витрина
          </Pill>
          <Pill active={inShelf} onClick={() => go("shelf")}>
            Ароматы
          </Pill>
          <CartPill />
        </div>

        {/* компьютер: узкая линейка у правого края — корзина и разделы сверху вниз точками */}
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto hidden flex-col items-center gap-3 lg:flex"
        >
          <CartButton />
          <ul className="flex flex-col items-center gap-0.5 rounded-full bg-white/75 px-1 py-2 shadow-[0_14px_30px_-18px_rgba(70,45,20,0.45)] ring-1 ring-ink/10 backdrop-blur-md">
            {RAIL.map((it, i) => (
              <li key={it.id} className={i === 1 ? "mt-1.5 border-t border-ink/10 pt-1.5" : ""}>
                <RailDot label={it.label} active={mark === it.id} flash={flash === it.id} onClick={() => go(it.id === "ring" ? "top" : it.id)} />
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </nav>
  );
}

/** точка линейки: у текущего раздела вытягивается в золотую черту; подпись — слева при наведении или при смене раздела */
function RailDot({ label, active, flash, onClick }: { label: string; active: boolean; flash: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className="group relative grid h-7 w-7 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {active ? (
        <motion.span layoutId="rail-mark" transition={{ type: "spring", bounce: 0.25, duration: 0.5 }} className="h-4 w-1.5 rounded-full bg-gold" />
      ) : (
        <span className="size-1.5 rounded-full bg-ink/25 transition-colors duration-300 group-hover:bg-gold" />
      )}
      <span
        className={`pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 font-serif text-[15px] leading-none shadow-sm ring-1 ring-ink/10 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 ${
          flash ? "translate-x-0 opacity-100" : "translate-x-1 opacity-0"
        } ${active ? "text-gold" : "text-ink"}`}
      >
        {label}
      </span>
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

/** корзина на линейке: круглая кнопка с сумкой, число — золотым кружком на уголке */
function CartButton() {
  const n = useCart().length;
  return (
    <motion.span
      key={n}
      initial={false}
      animate={n ? { y: [0, -4, 1, 0] } : undefined}
      transition={{ duration: 0.6, ease: [0.3, 1.6, 0.5, 1] }}
      aria-live="polite"
      aria-label={`Корзина: ${n}`}
      className="relative grid size-11 place-items-center rounded-full bg-white/85 shadow-[0_14px_30px_-18px_rgba(70,45,20,0.45)] ring-1 ring-ink/15 backdrop-blur-md"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <span className="absolute -right-1.5 -top-1.5 scale-[0.8]">
        <Count n={n} />
      </span>
    </motion.span>
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
