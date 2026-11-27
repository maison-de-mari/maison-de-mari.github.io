"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { aromas as ALL, minSum, minUsd, type AromaWithImages } from "@/data/aromas";
import { DETAILS, NOTE, type Note } from "@/data/notes";
import { cart, sum, useCart } from "@/lib/cart";
import { Scent } from "@/components/scent";
import { PerfumeRing } from "./perfume-ring/scene";
import { GlassRing, type RingSpec } from "./glass-showcase/glass-ring";
import { RevealText } from "./reveal-text";
import { quality, useQuality } from "@/lib/quality";
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
const priceFrom = (a: AromaWithImages) =>
  a.ask ? "цена по запросу" : a.usd ? `от ${minUsd(a)} $ · под заказ` : `от ${sum(minSum(a))}`;
const notes = (list: Note[]) => list.map((n) => NOTE[n][0]).join(" · ");

export function PerfumeCarousel({
  items = ALL,
  glass,
  children,
}: {
  items?: AromaWithImages[];
  /** стеклянные 3D-флаконы (по одному на каждый аромат items) — витрина на них вместо фото */
  glass?: RingSpec[];
  children?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const topText = useRef<HTMLDivElement>(null);
  const bottomText = useRef<HTMLDivElement>(null);
  const ring = useRef<PerfumeRing | GlassRing | null>(null);
  const frontBtn = useRef<HTMLButtonElement>(null);
  const [front, setFront] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  const pick = useCallback((i: number) => {
    setSel(i);
    ring.current?.select(i);
  }, []);
  // в крупном плане — к соседнему аромату, не возвращаясь к витрине
  const go = useCallback(
    (d: number) => {
      if (sel === null) return;
      pick((sel + d + items.length) % items.length);
    },
    [sel, items.length, pick],
  );
  useEffect(() => {
    if (sel === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sel, go]);
  const close = useCallback(() => {
    setSel((cur) => {
      if (cur !== null) window.setTimeout(() => frontBtn.current?.focus({ preventScroll: true }), 50);
      return null;
    });
    ring.current?.select(null);
  }, []);

  // лёгкий режим (слабая видеокарта, телефон): объёмные флаконы из фото без стеклянных слоёв и без самовращения
  const tier = useQuality();

  useEffect(() => {
    const el = host.current;
    if (!el || !tier) return;
    const lite = tier === "lite";
    const images = items.map((a) => ringSrc(a.slug));
    const events = {
      onFront: setFront,
      onHover: () => {},
      onPick: pick,
      onEmpty: close,
      onReady: () => setReady(true),
    };
    if (glass) {
      // стеклянная витрина: рисует только при движении, поэтому одинаково для всех устройств
      const g = new GlassRing(el, glass, events, BASE);
      ring.current = g;
      return () => {
        g.dispose();
        ring.current = null;
      };
    }
    const r = new PerfumeRing(
      el,
      images,
      events,
      // флаконы неподвижно стоят лицом наружу кольца и показывают бока и спину, когда оно крутится
      "outward",
      // к форме — фото сзади и (у плоских) сбоку
      items.map((a) => {
        const sp = SHAPE[a.slug];
        if (!sp) return null;
        return {
          ...sp,
          back: ringSrc(a.slug, "back"),
          side: ringSrc(a.slug, "side"),
          // стекло с жидкостью — только на сильной видеокарте; в лёгком режиме те же объёмные флаконы из фото
          mask: lite ? undefined : `${BASE}/ring/${a.slug}-mask.png`,
        };
      }),
      lite,
      () => quality.reportSlow(),
    );
    ring.current = r;
    return () => {
      r.dispose();
      ring.current = null;
    };
  }, [items, glass, pick, close, tier]);

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

  // прокрутка: сцена закреплена (pin), овал раскрывается в дугу, камера идёт вдоль — всё от одного прогресса (scrub)
  useEffect(() => {
    const el = stage.current;
    if (!el || !glass || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 2.6)}`,
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const r = ring.current;
            if (r && "setUnfold" in r) r.setUnfold(self.progress);
          },
        },
      });
      tl.to(topText.current, { autoAlpha: 0, y: -50, ease: "none", duration: 0.16 }, 0)
        .to(bottomText.current, { autoAlpha: 0, y: 40, ease: "none", duration: 0.12 }, 0)
        .to({}, { duration: 1 }, 0);
    }, el);
    return () => ctx.revert();
  }, [glass]);

  const f = items[front];
  const open = sel !== null;

  return (
    <section
      ref={stage}
      aria-label="Витрина ароматов"
      onKeyDown={onKey}
      className="relative isolate h-[max(640px,100svh)] w-full overflow-hidden text-ink select-none"
    >
      {tier === "rich" && <Scent tone="light" />}
      <div ref={host} className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`} />

      {/* шапка — общая, закреплённая: SiteNav */}

      {/* заголовок витрины (при раскрытии прокруткой уходит вверх) */}
      <div ref={topText} className="pointer-events-none absolute inset-0 z-10">
      <motion.div
        animate={{ opacity: open ? 0 : 1, y: open ? -10 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 text-center sm:top-24 ${children ? "top-[7.25rem]" : "top-[4.75rem]"}`}
      >
        <RevealText as="p" text="Парфюмерный бутик · Ташкент" className="text-[11px] font-medium uppercase tracking-[0.32em] text-soft" stagger={0.08} />
        <RevealText as="h1" text="Витрина ароматов" className="mt-3 font-serif text-[clamp(2.2rem,5.4vw,4.2rem)] font-light leading-none" delay={0.35} stagger={0.22} />
        {/* эпиграф */}
        <RevealText
          as="p"
          text="Любовь нельзя увидеть — её можно только почувствовать. Как аромат."
          className="mx-auto mt-4 max-w-[46rem] text-balance font-serif text-[clamp(1.05rem,1.7vw,1.35rem)] font-light italic leading-snug text-soft"
          delay={1.1}
          stagger={0.09}
        />
      </motion.div>

      </div>

      {/* аромат напротив зрителя (при раскрытии прокруткой уходит вниз) */}
      <div ref={bottomText} className="pointer-events-none absolute inset-0 z-10">
      <motion.div
        animate={{ opacity: open ? 0 : 1, y: open ? 12 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-4 pb-5 sm:pb-8 ${open ? "pointer-events-none" : "pointer-events-auto"}`}
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
                <RevealText
                  text={f.name}
                  inView={false}
                  stagger={0.07}
                  className="mt-1 block truncate font-serif text-[clamp(1.6rem,3vw,2.2rem)] font-light leading-tight transition-colors group-hover:text-gold"
                />
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
      </div>

      <AnimatePresence>
        {sel !== null && <Card key="card" aroma={items[sel]} index={sel} onClose={close} reduce={!!reduce} />}
        {sel !== null && (
          <motion.div
            key="nav"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.5, delay: reduce ? 0 : 0.8 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pointer-events-none absolute inset-0 z-20"
          >
            {/* телефон — по краям на уровне флакона; компьютер — под флаконом, с номером */}
            <div className="pointer-events-auto absolute top-[26%] left-2 lg:hidden">
              <Arrow dir={-1} onClick={() => go(-1)} solid />
            </div>
            <div className="pointer-events-auto absolute top-[26%] right-2 lg:hidden">
              <Arrow dir={1} onClick={() => go(1)} solid />
            </div>
            <div className="pointer-events-auto absolute bottom-8 left-[calc(50%-12vw)] hidden -translate-x-1/2 items-center gap-5 lg:flex">
              <Arrow dir={-1} onClick={() => go(-1)} solid />
              <span className="min-w-16 text-center text-[11px] font-medium uppercase tracking-[0.28em] text-soft tabular-nums">
                {num(sel)} / {num(items.length - 1)}
              </span>
              <Arrow dir={1} onClick={() => go(1)} solid />
            </div>
            <p className="absolute bottom-3 left-[calc(50%-12vw)] hidden -translate-x-1/2 text-[10px] uppercase tracking-[0.24em] text-soft/70 lg:block">
              Потяните флакон, чтобы повернуть
            </p>
          </motion.div>
        )}
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

function Arrow({ dir, onClick, solid }: { dir: 1 | -1; onClick: () => void; solid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Предыдущий аромат" : "Следующий аромат"}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-gold ring-1 ring-gold/30 transition-[background-color,box-shadow,transform] duration-200 hover:bg-gold/10 hover:ring-gold/60 active:scale-95 ${solid ? "bg-card/85 shadow-[0_6px_20px_-8px_rgba(60,40,20,.35)] backdrop-blur-sm" : ""}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
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
  const variants = a.usd || a.ask ? [] : (a.variants ?? [{ label: "10 ml", price: a.price }]);
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
        className="max-h-[inherit] overflow-y-auto overscroll-contain rounded-2xl bg-card/93 p-5 shadow-[0_30px_80px_-30px_rgba(70,45,20,.35)] ring-1 ring-ink/10 sm:p-7"
      >
        <motion.div ref={first} variants={stagger} custom={reduce ? 0 : 0.8} initial="hidden" animate="show" className="flex flex-col">
          <motion.p variants={rise} className="text-[11px] font-medium uppercase tracking-[0.28em] text-soft">
            Maison De Mari · № {num(index)}
            {d ? ` · ${d.family.ru}` : ""}
          </motion.p>
          <motion.p variants={rise} className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-gold">
            {a.brand}
          </motion.p>
          <RevealText as="h2" text={a.name} inView={false} delay={0.25} stagger={0.1} className="mt-1.5 font-serif text-[clamp(2.1rem,3.8vw,3.1rem)] font-light leading-[1.02]" />
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

          {a.ask && (
            <motion.div variants={rise} className="order-4 mt-4 flex flex-wrap items-center justify-between gap-4 lg:order-none lg:mt-5">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Распив и флакон</span>
                <span className="mt-1 block text-2xl font-light">Цена по запросу</span>
              </div>
              <a
                href={TG}
                target="_blank"
                rel="noopener"
                className="inline-flex h-12 items-center rounded-full bg-gold px-6 text-xs font-semibold uppercase tracking-[0.2em] text-night transition-[filter,transform] hover:brightness-110 active:scale-[.97]"
              >
                Узнать в Telegram
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
