"use client";

/**
 * Витрина ароматов — стеклянные полки по настроениям (по мотивам Product Shelf, Aakash Mehra).
 * Флаконы — наши фото. Нажатие: флакон перелетает со своего места на полке на страницу аромата и делает
 * оборот (перёд → бок → спина → перёд, по нашим фото сбоку и сзади). Его можно крутить пальцем: пока
 * держишь — 1:1, отпустил — докручивается с той же скоростью и встаёт лицом. Назад или Escape — флакон
 * возвращается на своё место. Пружины без отскока, при «уменьшить движение» — простое проявление.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RevealText } from "./reveal-text";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { ChevronDown, ChevronLeft, Minus, Plus } from "lucide-react";
import { aromas as ALL, FRONT_ONLY, minSum, minUsd, type AromaWithImages } from "@/data/aromas";
import { DETAILS, NOTE, type Note } from "@/data/notes";
import { MOODS, MOOD_OF, type Mood } from "@/data/moods";
import { cart, sum, useCart } from "@/lib/cart";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TG = "https://t.me/Maisondemari";
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.55 };
const img = (slug: string, view: "front" | "back" | "side") => `${BASE}/models/${slug}-${FRONT_ONLY.has(slug) ? "front" : view}.webp`;
/** облегчённое фото (640 px) — для полки, где флакон небольшой */
const thumb = (slug: string) => `${BASE}/ring/${slug}-front.webp`;

const MOOD_TITLE: Record<Mood, string> = {
  floral: "Цветочные",
  gourmand: "Гурманские",
  woody: "Древесные",
  fresh: "Свежие",
};

/** Плоские флаконы — у них есть фото сбоку; толщина относительно ширины (для поворота) */
const FLAT: Record<string, number> = {
  "orto-parisi-boccanera": 0.45, "creed-spring-flower": 0.55, "gritti-tutu": 0.9, "ysl-libre-berry-crush": 0.42,
  "bvlgari-le-gemme-tygar": 0.6, "parfums-de-marly-althair": 0.5, "phlur-vanilla-skin": 0.62, "essential-parfums-bois-imperial": 0.55,
  "tom-ford-tobacco-vanille": 0.55, "creed-wild-vetiver": 0.55, "amouage-purpose-50": 0.45, "hormone-paris-this-is-not-caffeine": 0.45,
  "mfk-724": 0.6, "bleu-de-chanel-parfum": 0.38,
};

const priceFrom = (a: AromaWithImages) => (a.ask ? "цена по запросу" : a.usd ? `от ${minUsd(a)} $` : `от ${sum(minSum(a))}`);
const notes = (list: readonly Note[]) => list.map((n) => NOTE[n][0]).join(" · ");
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ───────────────────────── флакон, который можно повернуть

/**
 * Поворот из фото: spin в оборотах (1 = 360°). Перёд и спина сменяют друг друга; у плоских флаконов
 * на ребре видно фото сбоку, а перёд/спина при этом сужаются (как настоящая коробка в перспективе).
 */
function TurnableBottle({ a, spin, priority }: { a: AromaWithImages; spin?: MotionValue<number>; priority?: boolean }) {
  const fallback = useMotionValue(0);
  const s = spin ?? fallback;
  const depth = FLAT[a.slug];
  const flat = depth !== undefined;
  const cos = useTransform(s, (v) => Math.cos(v * Math.PI * 2));
  // круглый флакон: силуэт не меняется, перёд плавно перетекает в спину (сумма всегда 1 — не пропадает)
  const frontO = useTransform(cos, (c) => (flat ? (c > 0 ? smooth(0.25, 0.6, c) : 0) : smooth(-0.2, 0.2, c)));
  const backO = useTransform(cos, (c) => (flat ? (c < 0 ? smooth(0.25, 0.6, -c) : 0) : 1 - smooth(-0.2, 0.2, c)));
  const sideO = useTransform(cos, (c) => (flat ? 1 - smooth(0.25, 0.6, Math.abs(c)) : 0));
  const faceX = useTransform(cos, (c) => (flat ? Math.max(Math.abs(c), depth) : 1));
  const sideX = useTransform(s, (v) => (flat ? Math.max(Math.abs(Math.sin(v * Math.PI * 2)), 0.3) : 1));
  const loading = priority ? "eager" : "lazy";
  return (
    <div className="relative size-full">
      <motion.img src={img(a.slug, "front")} alt="" loading={loading} draggable={false} style={{ opacity: frontO, scaleX: faceX }} className="absolute inset-0 size-full object-contain object-bottom" />
      <motion.img src={img(a.slug, "back")} alt="" loading="lazy" draggable={false} style={{ opacity: backO, scaleX: faceX }} className="absolute inset-0 size-full object-contain object-bottom" />
      {flat && <motion.img src={img(a.slug, "side")} alt="" loading="lazy" draggable={false} style={{ opacity: sideO, scaleX: sideX }} className="absolute inset-0 size-full object-contain object-bottom" />}
    </div>
  );
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ───────────────────────── полки

export function PerfumeShelf({ items = ALL }: { items?: AromaWithImages[] }) {
  const root = useRef<HTMLElement>(null);

  // полки появляются при прокрутке: флаконы поднимаются волной, подписи проявляются, по стеклу бежит блик;
  // ряды чуть отстают от страницы (параллакс) — появляется глубина
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>("[data-shelf-row]").forEach((row) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 88%", once: true } });
          tl.from(row.querySelectorAll("[data-shelf-bottle]"), { y: 70, autoAlpha: 0, duration: 1, ease: "power3.out", stagger: 0.09 })
            .from(row.querySelectorAll("[data-shelf-label]"), { y: 14, autoAlpha: 0, duration: 0.7, ease: "power2.out", stagger: 0.06 }, 0.3)
            .fromTo(
              row.querySelector("[data-shelf-glint]"),
              { xPercent: -120, autoAlpha: 1 },
              { xPercent: 950, duration: 1.3, ease: "power2.inOut", onComplete: function () { gsap.set(this.targets(), { autoAlpha: 0 }); } },
              0.15,
            );
          gsap.fromTo(row, { y: 34 }, { y: -34, ease: "none", scrollTrigger: { trigger: row, start: "top bottom", end: "bottom top", scrub: true } });
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((a) => a.slug === openId) ?? null;

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [openId]);

  return (
    <section ref={root} id="shelf" aria-labelledby="shelf-title" className="relative w-full scroll-mt-0 text-ink">
      <LayoutGroup>
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-20 pb-16 sm:px-6">
          <header className="mb-14 text-center">
            <RevealText as="p" text="Все ароматы бутика" className="text-[11px] font-medium uppercase tracking-[0.32em] text-soft" stagger={0.1} />
            <h2 id="shelf-title" className="mt-3 font-serif text-[clamp(2.4rem,5vw,3.8rem)] font-light leading-none">
              <RevealText text="Витрина" delay={0.3} />
            </h2>
          </header>

          {MOODS.map((mood) => {
            const list = items.filter((a) => MOOD_OF[a.slug] === mood);
            if (!list.length) return null;
            return (
              <div key={mood} id={`mood-${mood}`} className="mb-6 scroll-mt-24">
                <h3 className="mb-6 flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.3em] text-gold">
                  <RevealText text={MOOD_TITLE[mood]} stagger={0.1} />
                  <span aria-hidden className="h-px flex-1 bg-gold/40" />
                </h3>
                {chunk(list, 4).map((row, r) => (
                  <div key={r} data-shelf-row className="relative mb-14">
                    <ul className="relative z-10 grid grid-cols-4 items-end gap-3 px-2 sm:gap-8 sm:px-8">
                      {row.map((a) => (
                        <li key={a.slug} data-shelf-bottle className="flex flex-col items-center">
                          {openId === a.slug ? (
                            <div className="aspect-[2/3] w-full max-w-[170px]" />
                          ) : (
                            <motion.button
                              layoutId={`shelf-${a.slug}`}
                              type="button"
                              onClick={() => setOpenId(a.slug)}
                              aria-label={`${a.brand} ${a.name}, ${priceFrom(a)}`}
                              transition={SPRING}
                              whileHover={{ y: -6 }}
                              className="relative aspect-[2/3] w-full max-w-[170px] cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            >
                              {/* на полке — одна лёгкая картинка; фото для поворота грузятся только на странице аромата */}
                              {/* eslint-disable-next-line @next/next/no-img-element -- статический экспорт, картинки уже подготовлены */}
                              <img
                                src={thumb(a.slug)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                                className="absolute inset-0 size-full object-contain object-bottom"
                              />
                              {/* отражение в верхней плоскости стекла: картинка перевёрнута — маска тоже, поэтому «to_top» (видна полоска у стекла) */}
                              {/* eslint-disable-next-line @next/next/no-img-element -- то же фото, отражённое */}
                              <img
                                src={thumb(a.slug)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                                className="pointer-events-none absolute inset-x-0 top-full h-full w-full -scale-y-100 object-contain object-bottom opacity-25 [mask-image:linear-gradient(to_top,black,transparent_9%)]"
                              />
                            </motion.button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <GlassShelf />
                    <div className="mt-6 grid grid-cols-4 gap-3 px-2 sm:gap-8 sm:px-8">
                      {row.map((a) => (
                        <div key={a.slug} data-shelf-label className="min-w-0 text-center">
                          <div className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-gold sm:text-[11px]">{a.brand}</div>
                          <div className="mt-1 truncate font-serif text-[16px] leading-tight sm:text-[19px]">{a.name}</div>
                          <div className="mt-0.5 text-[12px] text-soft tabular-nums sm:text-[13px]">{priceFrom(a)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <AnimatePresence>{open && <AromaPage key={open.slug} a={open} onClose={() => setOpenId(null)} />}</AnimatePresence>
      </LayoutGroup>
    </section>
  );
}

/**
 * Стеклянная полка — толстое закалённое стекло:
 * верхняя плоскость (видна сверху под углом, с бликом), зеленоватая кромка с яркими гранями,
 * скруглённые торцы, латунные держатели; под полкой — мягкая тень, зелёный отсвет и полоска преломлённого света.
 */
function GlassShelf() {
  const brass = "bg-[linear-gradient(to_right,#7d5f2e,#e9cf98_45%,#b48c4c_60%,#7d5f2e)]";
  return (
    <div aria-hidden className="relative -mt-[9px] h-[22px]">
      {/* блик, который пробегает по стеклу, когда полка появляется (GSAP) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[21px] overflow-hidden rounded-[3px]">
        <div data-shelf-glint className="invisible absolute inset-y-0 left-0 w-[12%] skew-x-[-30deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.95),transparent)]" />
      </div>
      {/* верхняя плоскость: светлое стекло, к дальнему краю чуть темнее; блик бежит по диагонали */}
      <div className="absolute inset-x-0 top-0 h-[10px] overflow-hidden rounded-t-[3px] bg-[linear-gradient(to_bottom,rgba(205,226,219,0.35),rgba(236,245,241,0.75)_70%,rgba(255,255,255,0.9))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[3px]">
        <div className="absolute inset-y-0 left-[-10%] w-[45%] skew-x-[-35deg] bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.7),transparent)] opacity-70" />
        <div className="absolute inset-y-0 left-[58%] w-[10%] skew-x-[-35deg] bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.55),transparent)] opacity-60" />
      </div>
      {/* передняя кромка: толстое стекло зеленит, сверху и снизу — яркие грани */}
      <div className="absolute inset-x-0 top-[10px] h-[11px] rounded-b-[3px] bg-[linear-gradient(to_bottom,#e4f1ec_0%,#a6cdbf_22%,#7fb3a2_55%,#94c2b3_80%,#d3e9e1_100%)] shadow-[0_1px_0_rgba(255,255,255,0.6),0_2px_3px_rgba(40,70,60,0.18)]" />
      <div className="absolute inset-x-[1px] top-[10px] h-px bg-white/95" />
      <div className="absolute inset-x-[4%] top-[14px] h-[2px] rounded-full bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.85)_30%,rgba(255,255,255,0.4)_70%,transparent)]" />
      <div className="absolute inset-x-[2px] top-[19px] h-px bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.75),transparent)]" />
      {/* торцы: стекло на срезе светлее */}
      <div className="absolute left-0 top-[2px] h-[19px] w-[3px] rounded-l-[3px] bg-[linear-gradient(to_bottom,#f2f8f6,#b9d8cd)]" />
      <div className="absolute right-0 top-[2px] h-[19px] w-[3px] rounded-r-[3px] bg-[linear-gradient(to_bottom,#f2f8f6,#b9d8cd)]" />
      {/* латунные держатели: зажим охватывает стекло, снизу — ножка в стену */}
      {["left-[7%]", "right-[7%]"].map((pos) => (
        <div key={pos} className={`absolute top-[6px] ${pos} w-[12px]`}>
          <div className={`h-[17px] w-full rounded-[2px] ${brass} shadow-[0_2px_3px_rgba(60,40,10,0.3)]`} />
          <div className={`mx-auto h-[10px] w-[4px] rounded-b-[2px] ${brass}`} />
          <div className="absolute inset-x-[2px] top-[2px] h-px bg-white/70" />
        </div>
      ))}
      {/* под полкой на стене: мягкая тень, зелёный отсвет стекла и полоска преломлённого света */}
      <div className="absolute inset-x-[2%] top-[22px] h-[46px] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(55,85,75,0.16),transparent)]" />
      <div className="absolute inset-x-[10%] top-[24px] h-[22px] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(120,190,165,0.22),transparent)]" />
      <div className="absolute inset-x-[18%] top-[34px] h-px bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.9),rgba(200,240,225,0.8),transparent)] blur-[0.5px]" />
    </div>
  );
}

// ───────────────────────── страница аромата

/** цвет ауры — средний цвет флакона на фото, насыщеннее и светлее; пока не посчитан — золото */
function useAura(slug: string) {
  const [c, setC] = useState("rgba(201,164,99,0.55)");
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = thumb(slug);
    img.onload = () => {
      if (!alive) return;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 24;
      const x = cv.getContext("2d", { willReadFrequently: true });
      if (!x) return;
      x.drawImage(img, 0, 0, 24, 24);
      const p = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] < 200) continue;
        const sat = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2]);
        const w = 1 + sat / 40; // цветное важнее серого стекла
        r += p[i] * w; g += p[i + 1] * w; b += p[i + 2] * w; n += w;
      }
      if (!n) return;
      r /= n; g /= n; b /= n;
      // насыщеннее и светлее — аура, а не грязь
      const m = (r + g + b) / 3;
      const k = 2.1;
      const f = (v: number) => Math.round(Math.min(255, Math.max(0, m + (v - m) * k)) * 0.85 + 255 * 0.15);
      setC(`rgba(${f(r)},${f(g)},${f(b)},0.95)`);
    };
    return () => {
      alive = false;
    };
  }, [slug]);
  return c;
}

function AromaPage({ a, onClose }: { a: AromaWithImages; onClose: () => void }) {
  const reduce = useReducedMotion();
  const spin = useMotionValue(0);
  const d = DETAILS[a.slug];
  const variants = a.usd ? [] : (a.variants ?? [{ label: "10 ml", price: a.price }]);
  const [v, setV] = useState(0);
  const [qty, setQty] = useState(1);
  const [section, setSection] = useState<string | null>("Ноты");
  const items = useCart();
  const variant = variants[v];
  const inCart = !!variant && items.some((i) => i.slug === a.slug && i.label === variant.label);
  const closeRef = useRef<HTMLButtonElement>(null);
  const aura = useAura(a.slug);
  const drag = useRef<{ x: number; v: number; samples: { x: number; t: number }[] } | null>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    if (reduce) return;
    // один оборот при появлении
    const c = animate(spin, 1, { duration: 1.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 });
    return () => c.stop();
  }, [spin, reduce]);

  // крутить пальцем: пока держишь — 1:1, отпустил — докручивается и встаёт лицом
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    spin.stop();
    drag.current = { x: e.clientX, v: spin.get(), samples: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    if (!dr) return;
    spin.set(dr.v - (e.clientX - dr.x) / 420);
    dr.samples.push({ x: e.clientX, t: e.timeStamp });
    if (dr.samples.length > 5) dr.samples.shift();
  };
  const onUp = () => {
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    const f = dr.samples[0];
    const l = dr.samples[dr.samples.length - 1];
    const vx = l.t > f.t ? ((l.x - f.x) / (l.t - f.t)) * 1000 : 0;
    const velocity = -vx / 420;
    const projected = spin.get() + ((velocity / 1000) * 0.998) / (1 - 0.998);
    animate(spin, Math.round(projected), { type: "spring", bounce: 0, duration: 0.9, velocity });
  };

  const add = () => {
    if (!variant) return;
    for (let i = 0; i < qty; i++) if (!cart.has(a.slug, variant.label)) cart.toggle({ slug: a.slug, label: variant.label, price: variant.price });
  };

  const sections: [string, React.ReactNode][] = [
    ...(d
      ? ([
          [
            "Ноты",
            <dl key="n" className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              {(
                [
                  ["Верх", d.top],
                  ["Сердце", d.heart],
                  ["База", d.base],
                ] as const
              )
                .filter(([, list]) => list.length)
                .map(([k, list]) => (
                  <div key={k} className="contents">
                    <dt className="text-[10px] font-medium uppercase tracking-[0.24em] text-soft self-center">{k}</dt>
                    <dd>{notes(list)}</dd>
                  </div>
                ))}
            </dl>,
          ],
          ["Когда носить", <p key="w">{d.wear.ru}</p>],
        ] as [string, React.ReactNode][])
      : []),
    ["Как заказать", <p key="o">Распив оформляется через корзину; полный флакон — под заказ в Telegram. Доставка по Ташкенту.</p>],
  ];

  return (
    <motion.div role="dialog" aria-modal="true" aria-label={`${a.brand} ${a.name}`} className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain">
      <motion.div className="fixed inset-0 bg-night" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
      <div className="relative mx-auto grid min-h-full max-w-[1100px] grid-cols-1 items-center gap-8 px-5 pt-16 pb-12 md:grid-cols-[1.05fr_1fr] md:gap-14">
        {/* сцена аромата — тихо и изящно: едва заметное сияние цвета аромата, тонкая золотая дуга, светлая ниша и отражение */}
        <div className="relative flex flex-col items-center justify-center md:h-[calc(100dvh-7rem)]">
          <div className="relative">
            {/* сияние: очень мягкое, цвет аромата едва угадывается */}
            <motion.span
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 1.2, delay: 0.3 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="pointer-events-none absolute left-1/2 top-[44%] aspect-square h-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px]"
              style={{ background: `radial-gradient(circle, ${aura} 0%, transparent 68%)`, opacity: 0.45 }}
            />
            {/* арка-ниша: волосяная золотая линия, сверху — полукруг, как витринная ниша бутика */}
            <motion.svg
              aria-hidden
              viewBox="0 0 200 300"
              preserveAspectRatio="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 1, delay: 0.35 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="pointer-events-none absolute left-1/2 top-[-4%] h-[100%] w-[112%] -translate-x-1/2 overflow-visible"
            >
              <path
                d="M8,300 L8,100 A92,92 0 0 1 192,100 L192,300"
                fill="none"
                stroke="var(--color-gold)"
                strokeOpacity="0.5"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
            </motion.svg>

            <motion.div
              layoutId={`shelf-${a.slug}`}
              transition={SPRING}
              className="relative z-10 aspect-[2/3] h-[42vh] cursor-grab touch-none select-none active:cursor-grabbing md:h-[56vh]"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <TurnableBottle a={a} spin={spin} priority />
            </motion.div>

            {/* отражение флакона на глянцевом полу, быстро тает */}
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.14, transition: { duration: 0.8, delay: 0.5 } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              className="pointer-events-none absolute left-0 top-full h-[16%] w-full -scale-y-100 [mask-image:linear-gradient(to_top,black,transparent_80%)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- то же фото, отражённое */}
              <img src={img(a.slug, "front")} alt="" draggable={false} className="absolute bottom-0 left-0 h-[625%] w-full object-contain object-bottom" />
            </motion.div>
            {/* пол: тонкая линия и мягкая тень под флаконом */}
            <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[3%] w-[64%] -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-ink)_20%,transparent),transparent)]" />
            <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-px w-[150%] -translate-x-1/2 bg-[linear-gradient(to_right,transparent,color-mix(in_srgb,var(--color-gold)_55%,transparent),transparent)]" />
          </div>

          <p className="relative mt-[5vh] font-serif text-[15px] italic text-soft md:mt-[11vh]">Потяните, чтобы повернуть</p>
        </div>

        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ ...SPRING, delay: 0.05 }} className="relative z-20">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-ml-1.5 mb-6 inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" strokeWidth={1.8} /> К витрине
          </button>
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">{a.brand}</p>
          <RevealText as="h2" text={a.name} inView={false} ink inkTime={3} delay={0.2} stagger={0.1} className="mt-2 font-serif text-[clamp(2.2rem,4.4vw,3.2rem)] font-light leading-[1.02]" />
          {d && <p className="mt-2 text-sm text-soft">{d.family.ru}</p>}
          <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-ink/85">{a.description.ru}</p>

          {variant ? (
            <>
              <fieldset className="mt-7">
                <legend className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Распив</legend>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {variants.map((x, i) => {
                    const on = i === v;
                    return (
                      <label
                        key={x.label}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border bg-card/80 px-4 py-3 text-[14px] transition-[border-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold ${
                          on ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-[#ddd5ca] hover:border-soft"
                        }`}
                      >
                        <input type="radio" name="vol" checked={on} onChange={() => setV(i)} className="sr-only" />
                        <span className="font-medium">{x.label}</span>
                        <span className="text-soft tabular-nums">{sum(x.price)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-6 flex items-stretch gap-3">
                <div className="flex items-center rounded-xl border border-ink/15 bg-card/80">
                  <button type="button" aria-label="Меньше" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty === 1} className="grid h-full w-11 place-items-center rounded-l-xl disabled:text-[#d6cec3]">
                    <Minus className="size-4" />
                  </button>
                  <span className="w-7 text-center tabular-nums" aria-live="polite">{qty}</span>
                  <button type="button" aria-label="Больше" onClick={() => setQty((q) => Math.min(9, q + 1))} className="grid h-full w-11 place-items-center rounded-r-xl">
                    <Plus className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={add}
                  className={`h-12 flex-1 rounded-full text-xs font-semibold uppercase tracking-[0.2em] transition-[filter,transform] active:scale-[0.98] ${
                    inCart ? "bg-card text-gold ring-1 ring-gold/60" : "bg-[linear-gradient(180deg,#c9a463,#9a7438)] text-white hover:brightness-110"
                  }`}
                >
                  <span aria-live="polite">{inCart ? "В корзине" : `В корзину · ${sum(variant.price * qty)}`}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="mt-7">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-soft">{a.ask ? "Распив и флакон" : "Флакон под заказ"}</p>
              <p className="mt-1 text-2xl font-light tabular-nums">
                {a.ask ? "Цена по запросу" : a.usd?.map((u) => `${u.label} — ${u.usd} $`).join(" · ")}
              </p>
              <a href={TG} target="_blank" rel="noopener" className="mt-4 inline-flex h-12 items-center rounded-full bg-[linear-gradient(180deg,#c9a463,#9a7438)] px-7 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:brightness-110">
                Заказать в Telegram
              </a>
            </div>
          )}
          {a.bottle && (
            <p className="mt-4 text-sm text-soft">
              Полный флакон под заказ: <span className="text-ink/90">{a.bottle}</span>
            </p>
          )}

          <div className="mt-8 border-t border-[#ddd5ca]">
            {sections.map(([title, body]) => {
              const isOpen = section === title;
              return (
                <div key={title} className="border-b border-[#ddd5ca]">
                  <button type="button" aria-expanded={isOpen} onClick={() => setSection(isOpen ? null : title)} className="flex min-h-12 w-full items-center justify-between py-3 text-left text-[12px] font-medium uppercase tracking-[0.22em]">
                    {title}
                    <ChevronDown className={`size-4 text-soft transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
                        <div className="pb-5 text-[15px] leading-relaxed text-ink/80">{body}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default PerfumeShelf;
