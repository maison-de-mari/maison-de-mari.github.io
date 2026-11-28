"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { aromas as ALL, minSum, minUsd, type AromaWithImages } from "@/data/aromas";
import { DETAILS, NOTE, type Note } from "@/data/notes";
import { cart, sum, useCart } from "@/lib/cart";
import { GlassRing, type RingSpec } from "./glass-showcase/glass-ring";
import { RevealText } from "./reveal-text";
import { quality, useQuality } from "@/lib/quality";

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
  const ring = useRef<GlassRing | null>(null);
  const frontBtn = useRef<HTMLButtonElement>(null);
  const [front, setFront] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  // камера внутри витрины (прокрутка): стрелки прячутся, подпись показывает флакон, на который смотрим
  const [inside, setInside] = useState(false);
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

  // Подпись под витриной. Пока кольцо крутится быстро, флаконы проходят перёд по 10+ раз в секунду —
  // менять подпись на каждый (перерисовка, буквы, размытие) значит отнимать время у кадров витрины: она подёргивается.
  // Поэтому: кольцо идёт медленно — подпись меняется сразу, как раньше; быстро — один раз, когда оно притормозит.
  const frontAt = useRef(0);
  const frontTimer = useRef(0);
  const onFront = useCallback((i: number) => {
    const now = performance.now();
    window.clearTimeout(frontTimer.current);
    if (now - frontAt.current > 220) setFront(i);
    else frontTimer.current = window.setTimeout(() => setFront(i), 140);
    frontAt.current = now;
  }, []);
  useEffect(() => () => window.clearTimeout(frontTimer.current), []);

  // режим графики: на слабой видеокарте и телефоне витрина рисуется легче (см. GlassRing, lite)
  const tier = useQuality();
  const tierRef = useRef(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);
  const known = tier !== null;

  useEffect(() => {
    const el = host.current;
    if (!el || !tierRef.current || !glass) return;
    const g = new GlassRing(
      el,
      glass,
      { onFront, onPick: pick, onEmpty: close, onReady: () => setReady(true), onSlow: () => quality.reportSlow() },
      BASE,
      tierRef.current === "lite",
    );
    ring.current = g;
    return () => {
      g.dispose();
      ring.current = null;
    };
  }, [glass, pick, close, known, onFront]);
  // режим сменился (кадры не успевали) — витрина просто рисует легче
  useEffect(() => {
    if (tier) ring.current?.setLite(tier === "lite");
  }, [tier]);

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

  // прокрутка: сцена закреплена (pin), камера опускается в центр кольца и ведёт взгляд по кругу —
  // всё от одного прогресса (scrub); отпустили прокрутку — мягкая доводка к ближайшему флакону (snap)
  useGSAP(
    () => {
      const el = stage.current;
      if (!el || !glass) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const n = glass.length;
        // те же доли прогресса, что в GlassRing: спуск до 0.3, дальше флакон k — на 0.3 + 0.7·k/(n−1)
        const stops = [0, ...Array.from({ length: n }, (_, k) => 0.3 + (0.7 * k) / Math.max(1, n - 1))];
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: () => `+=${Math.round(window.innerHeight * 4.5)}`,
            pin: true,
            scrub: true,
            invalidateOnRefresh: true,
            snap: { snapTo: stops, inertia: false, directional: false, duration: { min: 0.25, max: 0.7 }, delay: 0.12, ease: "power2.inOut" },
            onUpdate: (self) => {
              const r = ring.current;
              r?.setUnfold(self.progress);
              setInside(self.progress > 0.02);
            },
          },
        });
        tl.to(topText.current, { autoAlpha: 0, y: -50, ease: "none", duration: 0.16 }, 0).to({}, { duration: 1 }, 0);
      });
      // шрифты меняют высоту текста — пересчитать места срабатывания
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
      return () => mm.revert();
    },
    { scope: stage, dependencies: [glass] },
  );

  const f = items[front];
  const open = sel !== null;

  return (
    <section
      ref={stage}
      aria-label="Витрина ароматов"
      onKeyDown={onKey}
      className="relative isolate h-[max(640px,100svh)] w-full overflow-hidden text-ink select-none"
    >
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
          <div className={`transition-opacity duration-500 ${inside ? "pointer-events-none opacity-0" : ""}`}>
            <Arrow dir={-1} onClick={() => ring.current?.turn(-1)} />
          </div>
          <button
            ref={frontBtn}
            type="button"
            onClick={() => !inside && pick(front)}
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
                  ink
                  inkTime={2.4}
                  className="mt-1 block truncate font-serif text-[clamp(1.95rem,3.7vw,2.75rem)] font-normal leading-tight text-[#0d0b09] transition-colors group-hover:text-gold dark:text-ink"
                />
                <span className="mt-1 block text-sm text-soft">{priceFrom(f)}</span>
              </motion.span>
            </AnimatePresence>
          </button>
          <div className={`transition-opacity duration-500 ${inside ? "pointer-events-none opacity-0" : ""}`}>
            <Arrow dir={1} onClick={() => ring.current?.turn(1)} />
          </div>
        </div>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.24em] text-soft/80">
          {inside ? "Прокручивайте — витрина вокруг вас" : "Потяните витрину · нажмите на флакон"}
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
    const t = window.setTimeout(() => first.current?.focus({ preventScroll: true }), reduce ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [a.slug, reduce]);

  const pyramid = d
    ? (
        [
          ["Верх", d.top, 10],
          ["Сердце", d.heart, 17],
          ["База", d.base, 24],
        ] as const
      ).filter(([, l]) => l.length)
    : [];
  const tgLink = "text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-gold";
  const goldBtn =
    "inline-flex h-12 items-center rounded-full bg-[linear-gradient(180deg,#c9a463,#9a7438)] px-6 text-xs font-semibold uppercase tracking-[0.2em] text-night shadow-[inset_0_1px_0_rgba(255,255,255,.4)] transition-[filter,transform] hover:brightness-110 active:scale-[.97]";

  return (
    <div
      data-card
      role="dialog"
      aria-label={`${a.brand} ${a.name}`}
      className="absolute inset-x-3 bottom-3 z-30 max-h-[52svh] sm:inset-x-6 sm:bottom-6 lg:inset-x-auto lg:bottom-auto lg:right-[6vw] lg:top-1/2 lg:max-h-[calc(100svh-7rem)] lg:w-[min(32rem,40vw)] lg:-translate-y-1/2"
    >
      <motion.div
        key={a.slug}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, delay: reduce ? 0 : 0.7, ease: EASE } }}
        exit={{ opacity: 0, y: 12, filter: "blur(6px)", transition: { duration: 0.22 } }}
        className="no-scrollbar relative max-h-[inherit] overflow-y-auto overscroll-contain rounded-[22px] bg-card/90 shadow-[0_40px_90px_-40px_rgba(40,25,10,.55)] ring-1 ring-ink/10 backdrop-blur-xl"
      >
        {/* паспорт аромата: тонкая золотая рамка внутри карточки */}
        <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[16px] ring-1 ring-gold/25" />
        <motion.div ref={first} tabIndex={-1} variants={stagger} custom={reduce ? 0 : 0.8} initial="hidden" animate="show" className="relative flex flex-col px-6 py-6 outline-none sm:px-9 sm:py-8">
          {/* шапка: номер и семейство */}
          <motion.div variants={rise} className="flex items-baseline justify-between gap-4 border-b border-gold/25 pb-3">
            <span className="font-serif text-[1.35rem] italic leading-none text-gold">№ {num(index)}</span>
            <span className="truncate text-[10px] font-medium uppercase tracking-[0.26em] text-soft">{d ? d.family.ru : "Maison De Mari"}</span>
          </motion.div>

          <motion.p variants={rise} className="mt-5 text-[11px] font-medium uppercase tracking-[0.34em] text-gold">
            {a.brand}
          </motion.p>
          <RevealText as="h2" text={a.name} inView={false} ink inkTime={3} delay={0.25} className="mt-2 font-serif text-[clamp(2.2rem,3.9vw,3.2rem)] font-normal leading-[1.02] tracking-[-0.01em]" />
          {d?.conc && (
            <motion.p variants={rise} className="mt-1 font-serif text-base italic text-soft">
              {d.conc}
            </motion.p>
          )}
          <motion.p variants={rise} className="order-5 mt-4 font-serif text-[17px] italic leading-relaxed text-ink/80 lg:order-none">
            {a.description.ru}
          </motion.p>

          {/* пирамида: золотые полоски растут сверху вниз, как у настоящей пирамиды нот */}
          {pyramid.length > 0 && (
            <motion.ul variants={rise} className="order-5 mt-6 flex flex-col gap-3 lg:order-none">
              {pyramid.map(([k, l, w]) => (
                <li key={k} className="grid grid-cols-[26px_5.2rem_1fr] items-baseline gap-x-2">
                  <span aria-hidden className="flex justify-center self-center">
                    <span className="h-[3px] rounded-full bg-gold/75" style={{ width: w }} />
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.26em] text-soft">{k}</span>
                  <span className="font-serif text-[16px] leading-snug">{notes([...l])}</span>
                </li>
              ))}
              {d && (
                <li className="mt-1 flex items-center gap-2 border-t border-ink/10 pt-3 text-[13px] text-soft">
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-gold" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                  {d.wear.ru}
                </li>
              )}
            </motion.ul>
          )}

          {variants.length > 0 && (
            <>
              {variants.length > 1 && (
                <motion.div
                  variants={rise}
                  role="radiogroup"
                  aria-label="Объём"
                  className="order-3 mt-5 inline-flex self-start rounded-full bg-ink/[0.05] p-1 ring-1 ring-ink/10 lg:order-none lg:mt-7"
                >
                  {variants.map((x, i) => (
                    <button
                      key={x.label}
                      type="button"
                      role="radio"
                      aria-checked={i === v}
                      onClick={() => setV(i)}
                      className={`relative min-h-10 rounded-full px-5 text-sm transition-colors duration-300 ${i === v ? "text-night" : "text-ink/75 hover:text-ink"}`}
                    >
                      {i === v && (
                        <motion.span
                          layoutId={`vol-${a.slug}`}
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,#c9a463,#9a7438)] shadow-[inset_0_1px_0_rgba(255,255,255,.35)]"
                          transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                        />
                      )}
                      <span className="relative">{x.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
              <motion.div variants={rise} className="order-4 mt-5 flex flex-wrap items-end justify-between gap-4 lg:order-none lg:mt-6">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.26em] text-soft">Распив · {variant.label}</span>
                  <span className="mt-1 block font-serif text-[2rem] leading-none tabular-nums">{sum(variant.price)}</span>
                </div>
                <SprayButton
                  inCart={inCart}
                  image={ringSrc(a.slug)}
                  onToggle={() => cart.toggle({ slug: a.slug, label: variant.label, price: variant.price })}
                />
              </motion.div>
            </>
          )}

          {(a.usd || a.ask) && (
            <motion.div variants={rise} className="order-4 mt-6 flex flex-wrap items-end justify-between gap-4 lg:order-none">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-[0.26em] text-soft">{a.usd ? "Флакон под заказ" : "Распив и флакон"}</span>
                <span className="mt-1 block font-serif text-[1.7rem] leading-tight tabular-nums">
                  {a.usd ? a.usd.map((u) => `${u.label} — ${u.usd} $`).join(" · ") : "Цена по запросу"}
                </span>
              </div>
              <a href={TG} target="_blank" rel="noopener" className={goldBtn}>
                {a.usd ? "Заказать в Telegram" : "Узнать в Telegram"}
              </a>
            </motion.div>
          )}

          {a.bottle && (
            <motion.p variants={rise} className="order-6 mt-5 flex items-start gap-2.5 rounded-xl bg-ink/[0.04] px-3.5 py-3 text-[13px] leading-snug text-soft lg:order-none">
              <svg aria-hidden viewBox="0 0 24 24" className="mt-px size-4 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
                <path d="M10 2.5h4v3h-4zM9 5.5h6l1 3H8z" />
                <rect x="6" y="8.5" width="12" height="13" rx="2.5" />
              </svg>
              <span>
                Полный флакон под заказ: <span className="text-ink/90">{a.bottle}</span> ·{" "}
                <a href={TG} target="_blank" rel="noopener" className={tgLink}>
                  уточнить в Telegram
                </a>
              </span>
            </motion.p>
          )}

          <motion.button
            variants={rise}
            type="button"
            onClick={onClose}
            className="group order-7 mt-6 inline-flex min-h-11 items-center gap-2 self-start text-[11px] font-medium uppercase tracking-[0.26em] text-soft transition-colors hover:text-ink lg:order-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="transition-transform duration-300 group-hover:-translate-x-1">
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
