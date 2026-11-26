"use client";

/**
 * Витрина «В стекле»: ряд стеклянных флаконов (GlassBottle) с этикетками ароматов бутика.
 * Ряд листается горизонтально — пальцем на телефоне, колесом/тачпадом и стрелками на компьютере;
 * касания не перехватываются, вертикальная прокрутка страницы работает поверх ряда.
 */

import { useRef, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { aromas, getAroma, minSum, minUsd } from "@/data/aromas";
import { GLASS_BOTTLES, type GlassBottleSettings } from "@/data/glass-bottles";
import { sum } from "@/lib/cart";
import { GlassBottle } from "./glass-bottle";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function GlassCollection({ items = GLASS_BOTTLES }: { items?: GlassBottleSettings[] }) {
  const row = useRef<HTMLUListElement>(null);
  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section aria-labelledby="glass-title" className="relative w-full overflow-hidden bg-night py-16 text-ink">
      <header className="mx-auto mb-8 flex max-w-[1100px] items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-soft">Коллекция</p>
          <h2 id="glass-title" className="mt-3 text-[clamp(1.6rem,4vw,2.6rem)] font-light uppercase leading-none tracking-[0.18em]">
            В стекле
          </h2>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" aria-label="Назад" onClick={() => page(-1)} className="grid size-11 place-items-center rounded-full text-gold ring-1 ring-gold/35 transition-colors hover:bg-gold/10">
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="Дальше" onClick={() => page(1)} className="grid size-11 place-items-center rounded-full text-gold ring-1 ring-gold/35 transition-colors hover:bg-gold/10">
            <ChevronRight className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <ul
        ref={row}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth px-[max(1rem,calc((100vw-1100px)/2+1.5rem))] pb-6 [scrollbar-width:none] [touch-action:pan-x_pan-y] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((b) => (
          <Card key={b.slug} b={b} row={row} />
        ))}
        <li aria-hidden className="w-px shrink-0" />
      </ul>
    </section>
  );
}

function Card({ b, row }: { b: GlassBottleSettings; row: RefObject<HTMLUListElement | null> }) {
  const card = useRef<HTMLLIElement>(null);
  const a = getAroma(b.slug) ?? aromas[0];
  const price = a.usd ? `от ${minUsd(a)} $` : `от ${sum(minSum(a))}`;
  return (
    <li
      ref={card}
      className="flex w-[68vw] max-w-[260px] shrink-0 snap-center flex-col items-center rounded-2xl bg-white/60 px-4 pt-6 pb-5 ring-1 ring-ink/5 sm:w-[260px]"
    >
      <GlassBottle
        color={b.color}
        fill={b.fill}
        label={`${BASE}${b.label}`}
        labelAspect={b.labelAspect}
        labelAlt={`Этикетка ${a.brand} ${a.name}`}
        cap={b.cap}
        size={150}
        scroller={row}
        hoverArea={card}
      />
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.24em] text-gold">{a.brand}</p>
      <p className="mt-1 w-full truncate text-center text-[15px]">{a.name}</p>
      <p className="mt-0.5 text-[13px] text-soft tabular-nums">{price}</p>
    </li>
  );
}

export default GlassCollection;
