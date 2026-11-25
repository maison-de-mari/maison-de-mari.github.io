"use client";

/**
 * Витрина ароматов — стеклянные полки по настроениям (по мотивам Product Shelf, Aakash Mehra).
 * Флаконы — наши фото. Нажатие: флакон перелетает со своего места на полке на страницу аромата и делает
 * оборот (перёд → бок → спина → перёд, по нашим фото сбоку и сзади). Его можно крутить пальцем: пока
 * держишь — 1:1, отпустил — докручивается с той же скоростью и встаёт лицом. Назад или Escape — флакон
 * возвращается на своё место. Пружины без отскока, при «уменьшить движение» — простое проявление.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { ChevronDown, ChevronLeft, Minus, Plus } from "lucide-react";
import { aromas as ALL, minSum, minUsd, type AromaWithImages } from "@/data/aromas";
import { DETAILS, NOTE, type Note } from "@/data/notes";
import { MOODS, MOOD_OF, type Mood } from "@/data/moods";
import { cart, sum, useCart } from "@/lib/cart";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TG = "https://t.me/Maisondemari";
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.55 };
const img = (slug: string, view: "front" | "back" | "side") => `${BASE}/models/${slug}-${view}.webp`;

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

const priceFrom = (a: AromaWithImages) => (a.usd ? `от ${minUsd(a)} $` : `от ${sum(minSum(a))}`);
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
    <section aria-labelledby="shelf-title" className="relative w-full bg-night text-ink">
      <LayoutGroup>
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-20 pb-16 sm:px-6">
          <header className="mb-14 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-soft">Все ароматы бутика</p>
            <h2 id="shelf-title" className="mt-3 text-[clamp(1.6rem,4vw,2.6rem)] font-light uppercase leading-none tracking-[0.18em]">
              Витрина
            </h2>
          </header>

          {MOODS.map((mood) => {
            const list = items.filter((a) => MOOD_OF[a.slug] === mood);
            if (!list.length) return null;
            return (
              <div key={mood} className="mb-6">
                <h3 className="mb-6 flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.3em] text-gold">
                  {MOOD_TITLE[mood]}
                  <span aria-hidden className="h-px flex-1 bg-gold/25" />
                </h3>
                {chunk(list, 4).map((row, r) => (
                  <div key={r} className="relative mb-14">
                    <ul className="relative z-10 grid grid-cols-4 items-end gap-3 px-2 sm:gap-8 sm:px-8">
                      {row.map((a) => (
                        <li key={a.slug} className="flex flex-col items-center">
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
                              <TurnableBottle a={a} />
                            </motion.button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <GlassShelf />
                    <div className="mt-6 grid grid-cols-4 gap-3 px-2 sm:gap-8 sm:px-8">
                      {row.map((a) => (
                        <div key={a.slug} className="min-w-0 text-center">
                          <div className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-gold sm:text-[11px]">{a.brand}</div>
                          <div className="mt-1 truncate text-[13px] leading-tight sm:text-[15px]">{a.name}</div>
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

/** Стеклянная полка: прозрачная плита с зеленоватой полированной кромкой, бликом и тенью на стене */
function GlassShelf() {
  return (
    <div aria-hidden className="relative -mt-[5px] h-[18px]">
      {/* верхняя плоскость стекла — светлая, почти прозрачная */}
      <div className="absolute inset-x-0 top-0 h-[7px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.55),rgba(214,232,226,0.5))] backdrop-blur-[2px]" />
      {/* кромка: толстое стекло зеленит; яркая линия — блик по краю */}
      <div className="absolute inset-x-0 top-[7px] h-[9px] bg-[linear-gradient(to_bottom,#cfe5dd,#a9cbbf_55%,#8fb8aa)] opacity-90" />
      <div className="absolute inset-x-0 top-[7px] h-px bg-white" />
      <div className="absolute inset-x-[6%] top-[9px] h-[2px] bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.8),transparent)]" />
      {/* золотые держатели */}
      <div className="absolute top-[4px] left-[8%] h-[14px] w-[5px] rounded-[1px] bg-[linear-gradient(to_right,#8a6a35,#d7b57a,#8a6a35)]" />
      <div className="absolute top-[4px] right-[8%] h-[14px] w-[5px] rounded-[1px] bg-[linear-gradient(to_right,#8a6a35,#d7b57a,#8a6a35)]" />
      {/* тень и зеленоватый отсвет стекла на стене */}
      <div className="absolute inset-x-[3%] top-[16px] h-[40px] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(60,90,80,0.16),transparent)]" />
    </div>
  );
}

// ───────────────────────── страница аромата

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
    <motion.div role="dialog" aria-modal="true" aria-label={`${a.brand} ${a.name}`} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <motion.div className="fixed inset-0 bg-[#f7f4ef]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
      <div className="relative mx-auto grid min-h-full max-w-[1100px] grid-cols-1 items-center gap-8 px-5 pt-16 pb-12 md:grid-cols-[1.05fr_1fr] md:gap-14">
        <div className="relative flex flex-col items-center justify-center md:h-[calc(100dvh-7rem)]">
          <motion.div
            layoutId={`shelf-${a.slug}`}
            transition={SPRING}
            className="relative z-10 aspect-[2/3] h-[42vh] cursor-grab touch-none select-none active:cursor-grabbing md:h-[60vh]"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <TurnableBottle a={a} spin={spin} priority />
          </motion.div>
          <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="w-[80%] max-w-[380px]">
            <GlassShelf />
          </motion.div>
          <p className="mt-6 text-[11px] uppercase tracking-[0.24em] text-soft">Потяните, чтобы повернуть</p>
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
          <h2 className="mt-2 text-[clamp(1.9rem,4vw,2.8rem)] font-light uppercase leading-[1.05] tracking-[0.08em]">{a.name}</h2>
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
                        className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white/80 px-4 py-3 text-[14px] transition-[border-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold ${
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
                <div className="flex items-center rounded-xl border border-[#ddd5ca] bg-white/80">
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
                    inCart ? "bg-white text-gold ring-1 ring-gold/60" : "bg-[linear-gradient(180deg,#c9a463,#9a7438)] text-white hover:brightness-110"
                  }`}
                >
                  <span aria-live="polite">{inCart ? "В корзине" : `В корзину · ${sum(variant.price * qty)}`}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="mt-7">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-soft">Флакон под заказ</p>
              <p className="mt-1 text-2xl font-light tabular-nums">{a.usd?.map((u) => `${u.label} — ${u.usd} $`).join(" · ")}</p>
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
