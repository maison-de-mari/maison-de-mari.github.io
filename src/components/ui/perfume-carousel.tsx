"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { aromas as ALL, minSum, minUsd, type AromaWithImages } from "@/data/aromas";
import { DETAILS, NOTE, type Note } from "@/data/notes";
import { cart, sum, useCart } from "@/lib/cart";
import { Scent } from "@/components/scent";
import { PerfumeRing } from "./perfume-ring/scene";
import type { SolidSpec } from "./perfume-ring/solid-bottle";

/*
 * Круглая 3D-витрина Maison De Mari (по мотивам Deck Rack Add To Cart).
 * Флаконы стоят по кругу на лакированном подиуме-циферблате: витрину крутят пальцем или мышью.
 * Нажатие на флакон — кольцо доворачивает его к зрителю, камера подъезжает, всплывает стеклянная
 * карточка с нотами и ценой. Кнопка «В корзину» переворачивается в воздухе (видно флакон) и
 * приземляется надписью «В корзине», счётчик корзины в углу перекатывается.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TG = "https://t.me/Maisondemari";
const EASE = [0.22, 1, 0.36, 1] as const;
/**
 * Флаконы на витрине — фото, неподвижно стоят лицом наружу кольца. Для кольца берём облегчённые копии
 * (public/ring, 640 px по высоте): в полном размере 24 флакона × 3 стороны занимали ~170 МБ видеопамяти.
 * 3D-модели (вариант со стеклом и жидкостью) сохранены в ветке variant-3d-glass — на сайте они лагали.
 */
const ringSrc = (slug: string, view: "front" | "back" | "side" = "front") => `${BASE}/ring/${slug}-${view}.webp`;

/**
 * Объём каждого флакона: круглый — тело вращения по силуэту фото; плоский — силуэт нужной толщины
 * (depth — толщина в долях ширины, как у настоящего флакона). Бока/верх/низ окрашиваются цветом флакона.
 */
const SHAPE: Record<string, SolidSpec> = {
  "louis-vuitton-moon-tale": { kind: "round" },
  "orto-parisi-boccanera": { kind: "flat", depth: 0.45 },
  "maison-crivelli-cuir-infrarouge": { kind: "round" },
  "creed-spring-flower": { kind: "flat", depth: 0.55 },
  "versace-cedrat-de-diamante": { kind: "round" },
  "gritti-tutu": { kind: "flat", depth: 0.9 },
  "ysl-libre-berry-crush": { kind: "flat", depth: 0.42 },
  "byredo-animalique": { kind: "round" },
  "louis-vuitton-lv-lovers": { kind: "round" },
  "bvlgari-le-gemme-tygar": { kind: "flat", depth: 0.6 },
  "parfums-de-marly-althair": { kind: "flat", depth: 0.5 },
  "reservation-riviera-californienne": { kind: "round" },
  "phlur-vanilla-skin": { kind: "flat", depth: 0.62 },
  "zielinski-rozen-tobacco-cedarwood-pepper": { kind: "round" },
  "zielinski-rozen-bergamot-green-tea-sandalwood": { kind: "round" },
  "essential-parfums-bois-imperial": { kind: "flat", depth: 0.55 },
  "tom-ford-tobacco-vanille": { kind: "flat", depth: 0.55 },
  "creed-wild-vetiver": { kind: "flat", depth: 0.55 },
  "amouage-purpose-50": { kind: "flat", depth: 0.45 },
  "penhaligons-halfeti-leather": { kind: "round" },
  "hormone-paris-this-is-not-caffeine": { kind: "flat", depth: 0.45 },
  "guerlain-nerolia-vetiver-set": { kind: "round" },
  "mfk-724": { kind: "flat", depth: 0.6 },
  "bleu-de-chanel-parfum": { kind: "flat", depth: 0.38 },
};
const num = (i: number) => String(i + 1).padStart(2, "0");
const priceFrom = (a: AromaWithImages) => (a.usd ? `от ${minUsd(a)} $ · под заказ` : `от ${sum(minSum(a))}`);
const notes = (list: Note[]) => list.map((n) => NOTE[n][0]).join(" · ");

export function PerfumeCarousel({ items = ALL, children }: { items?: AromaWithImages[]; children?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const ring = useRef<PerfumeRing | null>(null);
  const frontBtn = useRef<HTMLButtonElement>(null);
  const [front, setFront] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  const pick = useCallback((i: number) => {
    setSel(i);
    ring.current?.select(i);
  }, []);
  const close = useCallback(() => {
    setSel((cur) => {
      if (cur !== null) window.setTimeout(() => frontBtn.current?.focus({ preventScroll: true }), 50);
      return null;
    });
    ring.current?.select(null);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const images = items.map((a) => ringSrc(a.slug));
    const events = {
      onFront: setFront,
      onHover: () => {},
      onPick: pick,
      onEmpty: close,
      onReady: () => setReady(true),
    };
    const r = new PerfumeRing(
      el,
      images,
      events,
      "outward",
      // к форме — фото сзади и (у плоских) сбоку
      items.map((a) => {
        const sp = SHAPE[a.slug];
        if (!sp) return null;
        return { ...sp, back: ringSrc(a.slug, "back"), side: sp.kind === "flat" ? ringSrc(a.slug, "side") : undefined };
      }),
    );
    ring.current = r;
    return () => {
      r.dispose();
      ring.current = null;
    };
  }, [items, pick, close]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);

  const onKey = (e: React.KeyboardEvent) => {
    if (sel !== null || (e.target as HTMLElement).closest("[data-card]")) return;
    if (e.key === "ArrowRight") ring.current?.turn(1);
    else if (e.key === "ArrowLeft") ring.current?.turn(-1);
    else return;
    e.preventDefault();
  };

  const f = items[front];
  const open = sel !== null;

  return (
    <section
      aria-label="Витрина ароматов"
      onKeyDown={onKey}
      className="relative isolate h-[max(640px,100svh)] w-full overflow-hidden bg-night text-ink select-none"
    >
      <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(120%_80%_at_50%_38%,#ffffff_0%,#f7f3ed_55%,#ebe3d6_100%)]" />
      <Scent tone="light" />
      <div ref={host} className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`} />
      {/* затемнение снизу — подпись читается поверх края подиума */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-night via-night/70 to-transparent" />

      {/* шапка */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
        <a href={`${BASE}/`} className="pointer-events-auto font-script text-[2rem] leading-none text-gold sm:text-[2.4rem]">
          Maison De Mari
        </a>
        <CartPill />
      </header>

      {/* заголовок витрины */}
      <motion.div
        animate={{ opacity: open ? 0 : 1, y: open ? -10 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 text-center sm:top-24 ${children ? "top-[7.25rem]" : "top-[4.75rem]"}`}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-soft">Парфюмерный бутик · Ташкент</p>
        <h1 className="mt-3 text-[clamp(1.6rem,4vw,3rem)] font-light uppercase leading-none tracking-[0.18em]">Витрина ароматов</h1>
      </motion.div>

      {/* аромат напротив зрителя */}
      <motion.div
        animate={{ opacity: open ? 0 : 1, y: open ? 12 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-4 pb-5 sm:pb-8 ${open ? "pointer-events-none" : ""}`}
        aria-hidden={open}
      >
        <div className="flex w-full max-w-xl items-center justify-between gap-3">
          <Arrow dir={-1} onClick={() => ring.current?.turn(-1)} />
          <button
            ref={frontBtn}
            type="button"
            onClick={() => pick(front)}
            className="group min-h-11 min-w-0 flex-1 rounded-lg px-2 py-1 text-center"
            aria-label={`${f.brand} ${f.name}, ${priceFrom(f)} — открыть`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={f.slug}
                initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.15 } }}
                transition={{ duration: 0.35, ease: EASE }}
                className="block"
              >
                <span className="block truncate text-[11px] font-medium uppercase tracking-[0.3em] text-gold">
                  {num(front)} · {f.brand}
                </span>
                <span className="mt-1.5 block truncate text-[clamp(1.25rem,2.6vw,1.75rem)] font-light uppercase tracking-[0.12em] transition-colors group-hover:text-gold">
                  {f.name}
                </span>
                <span className="mt-1 block text-sm text-soft">{priceFrom(f)}</span>
              </motion.span>
            </AnimatePresence>
          </button>
          <Arrow dir={1} onClick={() => ring.current?.turn(1)} />
        </div>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.24em] text-soft/80">
          Потяните витрину · нажмите на флакон
        </p>
      </motion.div>

      {/* карточка аромата */}
      <AnimatePresence>
        {sel !== null && <Card key="card" aroma={items[sel]} index={sel} onClose={close} reduce={!!reduce} />}
      </AnimatePresence>

      {children}

      {/* для экранных чтецов и клавиатуры — тот же выбор списком */}
      <ul className="sr-only">
        {items.map((a, i) => (
          <li key={a.slug}>
            <button type="button" onClick={() => pick(i)}>
              {a.brand} {a.name}, {priceFrom(a)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Arrow({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Предыдущий аромат" : "Следующий аромат"}
      className="grid size-11 shrink-0 place-items-center rounded-full text-gold ring-1 ring-gold/30 transition-[background-color,box-shadow,transform] duration-200 hover:bg-gold/10 hover:ring-gold/60 active:scale-95"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
      className="pointer-events-auto inline-flex h-10 items-center gap-2.5 rounded-full bg-white/85 pl-4 pr-1.5 text-[11px] font-medium uppercase tracking-[0.22em] ring-1 ring-ink/15"
    >
      Корзина
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

const stagger: Variants = {
  hidden: {},
  show: (delay: number) => ({ transition: { delayChildren: delay, staggerChildren: 0.055 } }),
};
const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

function Card({ aroma: a, index, onClose, reduce }: { aroma: AromaWithImages; index: number; onClose: () => void; reduce: boolean }) {
  const d = DETAILS[a.slug];
  const variants = a.usd ? [] : (a.variants ?? [{ label: "10 ml", price: a.price }]);
  const [v, setV] = useState(0);
  const items = useCart();
  const variant = variants[v];
  const inCart = !!variant && items.some((i) => i.slug === a.slug && i.label === variant.label);
  const first = useRef<HTMLDivElement>(null);

  // фокус в карточку, когда камера доехала
  useEffect(() => {
    const t = window.setTimeout(() => first.current?.querySelector<HTMLElement>("button,a")?.focus({ preventScroll: true }), reduce ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [a.slug, reduce]);

  return (
    <div
      data-card
      role="dialog"
      aria-label={`${a.brand} ${a.name}`}
      className="absolute inset-x-3 bottom-3 z-30 max-h-[50svh] sm:inset-x-6 sm:bottom-6 lg:inset-x-auto lg:bottom-auto lg:right-[6vw] lg:top-1/2 lg:max-h-[calc(100svh-7rem)] lg:w-[min(31rem,40vw)] lg:-translate-y-1/2"
    >
      <motion.div
        key={a.slug}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, delay: reduce ? 0 : 0.7, ease: EASE } }}
        exit={{ opacity: 0, y: 12, filter: "blur(6px)", transition: { duration: 0.22 } }}
        className="max-h-[inherit] overflow-y-auto overscroll-contain rounded-2xl bg-white/93 p-5 shadow-[0_30px_80px_-30px_rgba(70,45,20,.35)] ring-1 ring-ink/10 sm:p-7"
      >
        <motion.div ref={first} variants={stagger} custom={reduce ? 0 : 0.8} initial="hidden" animate="show" className="flex flex-col">
          <motion.p variants={rise} className="text-[11px] font-medium uppercase tracking-[0.28em] text-soft">
            Maison De Mari · № {num(index)}
            {d ? ` · ${d.family.ru}` : ""}
          </motion.p>
          <motion.p variants={rise} className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-gold">
            {a.brand}
          </motion.p>
          <motion.h2 variants={rise} className="mt-1.5 text-[clamp(1.75rem,3.2vw,2.6rem)] font-light uppercase leading-[1.05] tracking-[0.08em]">
            {a.name}
          </motion.h2>
          <motion.p variants={rise} className="order-5 mt-3 text-[15px] leading-relaxed text-ink/85 lg:order-none">
            {a.description.ru}
          </motion.p>

          {d && (
            <motion.dl variants={rise} className="order-5 mt-5 grid lg:order-none grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-ink/10 pt-4 text-sm">
              {(
                [
                  ["Верх", d.top],
                  ["Сердце", d.heart],
                  ["База", d.base],
                ] as const
              )
                .filter(([, l]) => l.length)
                .map(([k, l]) => (
                  <div key={k} className="contents">
                    <dt className="self-center text-[10px] font-medium uppercase tracking-[0.24em] text-soft">{k}</dt>
                    <dd>{notes([...l])}</dd>
                  </div>
                ))}
              <dt className="self-center text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Когда</dt>
              <dd>{d.wear.ru}</dd>
            </motion.dl>
          )}

          {variants.length > 0 && (
            <>
              {variants.length > 1 && (
                <motion.div variants={rise} role="radiogroup" aria-label="Объём" className="order-3 mt-4 flex lg:order-none lg:mt-5 flex-wrap gap-2">
                  {variants.map((x, i) => (
                    <button
                      key={x.label}
                      type="button"
                      role="radio"
                      aria-checked={i === v}
                      onClick={() => setV(i)}
                      className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
                        i === v ? "bg-ink text-night" : "text-ink/80 ring-1 ring-ink/20 hover:ring-ink/45"
                      }`}
                    >
                      {x.label}
                    </button>
                  ))}
                </motion.div>
              )}
              <motion.div variants={rise} className="order-4 mt-4 flex flex-wrap items-center justify-between gap-4 lg:order-none lg:mt-5">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Распив · {variant.label}</span>
                  <span className="mt-1 block text-2xl font-light tabular-nums">{sum(variant.price)}</span>
                </div>
                <SprayButton
                  inCart={inCart}
                  image={ringSrc(a.slug)}
                  onToggle={() => cart.toggle({ slug: a.slug, label: variant.label, price: variant.price })}
                />
              </motion.div>
            </>
          )}

          {a.usd && (
            <motion.div variants={rise} className="order-4 mt-4 flex flex-wrap items-center justify-between gap-4 lg:order-none lg:mt-5">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Флакон под заказ</span>
                <span className="mt-1 block text-2xl font-light tabular-nums">{a.usd.map((u) => `${u.label} — ${u.usd} $`).join(" · ")}</span>
              </div>
              <a
                href={TG}
                target="_blank"
                rel="noopener"
                className="inline-flex h-12 items-center rounded-full bg-gold px-6 text-xs font-semibold uppercase tracking-[0.2em] text-night transition-[filter,transform] hover:brightness-110 active:scale-[.97]"
              >
                Заказать в Telegram
              </a>
            </motion.div>
          )}

          {a.bottle && (
            <motion.p variants={rise} className="order-6 mt-4 text-sm text-soft lg:order-none">
              Полный флакон под заказ: <span className="text-ink/90">{a.bottle}</span> ·{" "}
              <a href={TG} target="_blank" rel="noopener" className="text-gold underline-offset-4 hover:underline">
                уточнить в Telegram
              </a>
            </motion.p>
          )}

          <motion.button
            variants={rise}
            type="button"
            onClick={onClose}
            className="order-7 mt-6 inline-flex self-start lg:order-none min-h-11 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-soft transition-colors hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Назад к витрине
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** «В корзину»: кнопка подпрыгивает и делает сальто — на изнанке флакон — и приземляется «В корзине» с золотым пшиком */
function SprayButton({ inCart, image, onToggle }: { inCart: boolean; image: string; onToggle: () => void }) {
  const [phase, setPhase] = useState<"on" | "off" | null>(null);
  // пока кнопка в воздухе, надпись ведём сами; на земле она просто отражает корзину
  const [flight, setFlight] = useState<boolean | null>(null);
  const label = flight ?? inCart;
  const [burst, setBurst] = useState(0);
  const timers = useRef<number[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const click = () => {
    if (phase) return;
    if (reduce) {
      onToggle();
      return;
    }
    setPhase(inCart ? "off" : "on");
    setFlight(inCart);
    if (!inCart) setBurst((b) => b + 1);
    // надпись меняется, пока кнопка повернута изнанкой; корзина — в момент приземления
    timers.current.push(window.setTimeout(() => setFlight(!inCart), 400));
    timers.current.push(window.setTimeout(onToggle, 640));
    timers.current.push(window.setTimeout(() => {
      setPhase(null);
      setFlight(null);
    }, 820));
  };

  const turn = phase === "off" ? -1 : 1;
  return (
    <button type="button" onClick={click} aria-pressed={inCart} className="relative h-12 w-[12.5rem] shrink-0 rounded-full [perspective:560px]">
      <motion.span
        aria-hidden
        className="absolute inset-x-[12%] -bottom-2 h-2 rounded-[50%] bg-black/45 blur-[4px]"
        animate={phase ? { scaleX: [1, 1, 0.55, 1, 1], opacity: [1, 1, 0.35, 1, 1] } : { scaleX: 1, opacity: 1 }}
        transition={phase ? { duration: 0.8, times: [0, 0.14, 0.5, 0.84, 1] } : { duration: 0 }}
      />
      <motion.span
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={
          phase
            ? { y: [0, 3, -30, 0, 2, 0], rotateX: [0, 0, 190 * turn, 360 * turn, 360 * turn, 360 * turn], rotateZ: [0, 0, -4 * turn, 0, 0, 0] }
            : { y: 0, rotateX: 0, rotateZ: 0 }
        }
        transition={phase ? { duration: 0.8, times: [0, 0.14, 0.5, 0.84, 0.92, 1], ease: "easeInOut" } : { duration: 0 }}
      >
        <span
          className={`absolute inset-0 grid place-items-center rounded-full text-xs font-semibold uppercase tracking-[0.2em] [backface-visibility:hidden] ${
            label
              ? "bg-ink/8 text-gold ring-1 ring-gold/60"
              : "bg-[linear-gradient(180deg,#c9a463,#9a7438)] text-night shadow-[inset_0_1px_0_rgba(255,255,255,.4),inset_0_-2px_0_rgba(0,0,0,.18)]"
          }`}
        >
          {label ? "В корзине" : "В корзину"}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-full bg-[#21160f] ring-1 ring-gold/50 [backface-visibility:hidden] [transform:rotateX(180deg)_translateZ(1px)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" draggable={false} className="absolute left-1/2 top-1/2 h-[180%] -translate-x-1/2 -translate-y-1/2 rotate-90 object-contain" />
        </span>
      </motion.span>
      {burst > 0 && (
          <span key={burst} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
            {Array.from({ length: 12 }, (_, i) => {
              const ang = (i / 12) * Math.PI * 2;
              const r = 46 + (i % 3) * 18;
              return (
                <motion.span
                  key={i}
                  className="absolute size-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(232,200,140,.9)]"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: Math.cos(ang) * r * 1.6, y: Math.sin(ang) * r * 0.7 - 10, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  transition={{ duration: 0.9, delay: 0.55, ease: "easeOut" }}
                />
              );
            })}
          </span>
      )}
    </button>
  );
}

export default PerfumeCarousel;
