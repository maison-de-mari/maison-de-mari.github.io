"use client";

/**
 * Стеклянный флакон Maison De Mari — CSS 3D, без WebGL.
 * Прозрачная восьмигранная колба с толстым дном, внутри — отдельный объём парфюма с отчётливой
 * поверхностью. Курсор слегка наклоняет и поворачивает флакон; поверхность жидкости при наклоне
 * отстаёт и плавно (с лёгким колебанием) возвращается к горизонтали. Внутри прокручиваемой витрины
 * жидкость так же покачивается от скорости прокрутки.
 *
 * Настройки: color — цвет парфюма, fill — уровень (0…1, по умолчанию 0.75), label — картинка этикетки,
 * cap — крышка ("gold" | "black" | CSS-цвет), size — ширина флакона в px.
 * Касания не перехватываются: на телефоне витрина и страница свободно листаются пальцем.
 */

import { useEffect, useRef, type RefObject } from "react";

export type GlassBottleProps = {
  /** цвет парфюма */
  color: string;
  /** уровень наполнения, 0…1 */
  fill?: number;
  /** картинка этикетки и её пропорции (ширина / высота) */
  label?: string;
  labelAspect?: number;
  labelAlt?: string;
  /** крышка: "gold" (золото с желобками), "black" или любой CSS-цвет */
  cap?: string;
  /** ширина флакона, px */
  size?: number;
  /** прокручиваемая витрина: скорость прокрутки раскачивает жидкость */
  scroller?: RefObject<HTMLElement | null>;
  /** где следить за курсором (по умолчанию — сам флакон); удобно отдать всю карточку */
  hoverArea?: RefObject<HTMLElement | null>;
  className?: string;
};

// геометрия в единицах u (как в разметке): внутренняя высота колбы — от 5u (стенка) до 83u (верх дна)
const INNER_TOP = 5;
const INNER_FLOOR = 83;
const M = 26; // запас грани жидкости над поверхностью — под наклон
const LIQ = { w: 74, d: 34, c: 6.93 };
const DEG = Math.PI / 180;

/** грани жидкости: ширина, сдвиг, вынос и поворот (n·45°) — те же формулы, что в CSS */
const FACES = Array.from({ length: 8 }, (_, n) => {
  const { w, d, c } = LIQ;
  let fw: number, fz: number, fx = 0;
  if (n % 4 === 0) {
    fw = w - 2 * c;
    fz = d / 2;
  } else if (n % 4 === 2) {
    fw = d - 2 * c;
    fz = w / 2;
  } else {
    fw = c * Math.SQRT2;
    fz = (w / 2 + d / 2 - c) / Math.SQRT2;
    fx = n % 4 === 1 ? (w - d) / 2 / Math.SQRT2 : (d - w) / 2 / Math.SQRT2;
  }
  const a = n * 45 * DEG;
  // X (поперёк флакона) левого и правого края грани
  const xl = (-fw / 2 + fx) * Math.cos(a) + fz * Math.sin(a);
  const xr = (fw / 2 + fx) * Math.cos(a) + fz * Math.sin(a);
  return { n, xl, xr };
});

function shade(hex: string, k: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)));
  return `rgb(${ch.join(" ")})`;
}

function capColors(cap: string) {
  if (cap === "gold") return { cap: "#e6c58a", hi: "#fff6dc", deep: "#9a7438", smooth: false };
  if (cap === "black") return { cap: "#1d1c1f", hi: "#6b6a70", deep: "#050506", smooth: true };
  return { cap: shade(cap, 0), hi: shade(cap, 0.55), deep: shade(cap, -0.45), smooth: true };
}

export function GlassBottle({
  color,
  fill = 0.75,
  label,
  labelAspect = 1,
  labelAlt = "",
  cap = "gold",
  size = 168,
  scroller,
  hoverArea,
  className,
}: GlassBottleProps) {
  const scene = useRef<HTMLDivElement>(null);
  const bottle = useRef<HTMLDivElement>(null);
  const faces = useRef<(HTMLElement | null)[]>([]);
  const surface = useRef<HTMLElement>(null);

  const u = size / 84;
  const f = Math.min(1, Math.max(0, fill));
  const liquidH = f * (INNER_FLOOR - INNER_TOP);
  const level = INNER_FLOOR - liquidH; // поверхность, u от верха колбы
  // этикетка: не шире 58u и не выше 46u, по пропорциям картинки
  const lw = Math.min(58, 46 * labelAspect);
  const lh = lw / labelAspect;
  const capC = capColors(cap);

  useEffect(() => {
    const el = scene.current;
    const area = hoverArea?.current ?? el;
    if (!el || !area) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // состояние: наклон флакона (lean), поворот (yaw), поверхность относительно флакона (rel)
    const st = { lean: 0, leanV: 0, yaw: -24, yawV: 0, pitch: -12, pitchV: 0, rel: 0, relV: 0 };
    const tgt = { px: 0, py: 0, push: 0 };
    let raf = 0;
    let last = 0;

    const draw = () => {
      bottle.current!.style.transform = `rotateX(${st.pitch}deg) rotateY(${st.yaw}deg) rotateZ(${st.lean}deg)`;
      // поверхность: относительно флакона повёрнута на rel — в мире она (почти) горизонтальна
      const t = Math.tan(st.rel * DEG);
      for (const fc of FACES) {
        const node = faces.current[fc.n];
        if (!node) continue;
        const yl = (M + t * fc.xl) * u;
        const yr = (M + t * fc.xr) * u;
        node.style.clipPath = `polygon(0 ${yl.toFixed(2)}px, 100% ${yr.toFixed(2)}px, 100% 100%, 0 100%)`;
      }
      surface.current!.style.transform = `rotateZ(${st.rel}deg) rotateX(90deg) scaleX(${(1 / Math.cos(st.rel * DEG)).toFixed(4)})`;
    };

    const spring = (x: number, v: number, to: number, k: number, z: number, dt: number) => {
      const c = 2 * Math.sqrt(k) * z;
      const a = k * (to - x) - c * v;
      v += a * dt;
      return [x + v * dt, v];
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      tgt.push *= Math.exp(-dt * 3); // толчок от прокрутки затухает
      const leanTo = tgt.px * 9 + tgt.push;
      [st.lean, st.leanV] = spring(st.lean, st.leanV, leanTo, 70, 0.85, dt);
      [st.yaw, st.yawV] = spring(st.yaw, st.yawV, -24 + tgt.px * 30, 40, 1, dt);
      [st.pitch, st.pitchV] = spring(st.pitch, st.pitchV, -12 - tgt.py * 7, 40, 1, dt);
      // жидкость догоняет горизонталь с отставанием и лёгким колебанием (слабое затухание)
      [st.rel, st.relV] = spring(st.rel, st.relV, -st.lean, 38, 0.2, dt);
      st.rel = Math.max(-28, Math.min(28, st.rel));
      draw();
      const busy =
        Math.abs(st.leanV) + Math.abs(st.yawV) + Math.abs(st.pitchV) + Math.abs(st.relV) > 0.05 ||
        Math.abs(st.lean - leanTo) + Math.abs(st.rel + st.lean) + Math.abs(tgt.push) > 0.05;
      if (busy) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!raf && !reduce) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // на телефоне — только прокрутка, касания не трогаем
      const r = el.getBoundingClientRect();
      tgt.px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
      tgt.py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
      el.dataset.active = "";
      kick();
    };
    const onLeave = () => {
      tgt.px = tgt.py = 0;
      delete el.dataset.active;
      kick();
    };
    area.addEventListener("pointermove", onMove, { passive: true });
    area.addEventListener("pointerleave", onLeave, { passive: true });

    // прокрутка витрины: флакон отклоняется против движения, жидкость раскачивается
    const sc = scroller?.current;
    let lastX = sc?.scrollLeft ?? 0;
    let lastT = performance.now();
    const onScroll = () => {
      if (!sc) return;
      const now = performance.now();
      const v = (sc.scrollLeft - lastX) / Math.max(8, now - lastT); // px/мс
      lastX = sc.scrollLeft;
      lastT = now;
      tgt.push = Math.max(-12, Math.min(12, tgt.push - v * 5));
      kick();
    };
    sc?.addEventListener("scroll", onScroll, { passive: true });

    draw();
    return () => {
      cancelAnimationFrame(raf);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      sc?.removeEventListener("scroll", onScroll);
    };
  }, [u, hoverArea, scroller]);

  const vars = {
    "--u": `${u}px`,
    "--liquid": color,
    "--liquid-hi": shade(color, 0.22),
    "--lt": `calc(${level - M} * var(--u))`,
    "--lh": `calc(${liquidH + M} * var(--u))`,
    "--m": `calc(${M} * var(--u))`,
    "--lw": `calc(${lw} * var(--u))`,
    "--lhh": `calc(${lh} * var(--u))`,
    "--cap": capC.cap,
    "--cap-hi": capC.hi,
    "--cap-deep": capC.deep,
  } as React.CSSProperties;

  return (
    <div ref={scene} className={`gb-scene ${className ?? ""}`} style={vars} data-cap={capC.smooth ? "smooth" : undefined}>
      <div ref={bottle} className="gb-bottle">
        <i className="gb-shadow" />
        <div className={`gb-prism gb-liquid`}>
          {FACES.map((fc) => (
            <i
              key={fc.n}
              ref={(n) => {
                faces.current[fc.n] = n;
              }}
              style={{ "--n": fc.n } as React.CSSProperties}
            />
          ))}
          <b ref={surface} className={`gb-octagon gb-surface`} />
        </div>
        <b className={`gb-octagon gb-floor`} />
        <div className={`gb-prism gb-glass`}>
          {Array.from({ length: 8 }, (_, n) => (
            <i key={n} style={{ "--n": n } as React.CSSProperties}>
              {n === 0 && <em className="gb-glint" />}
            </i>
          ))}
        </div>
        <b className={`gb-octagon gb-top`} />
        {label && (
          <span className="gb-label">
            {/* eslint-disable-next-line @next/next/no-img-element -- статический экспорт, картинка подготовлена */}
            <img src={label} alt={labelAlt} loading="lazy" decoding="async" draggable={false} />
          </span>
        )}
        <div className={`gb-box gb-neck`}>
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className={`gb-box gb-cap`}>
          <i>
            <em className="gb-glint" />
          </i>
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

export default GlassBottle;
