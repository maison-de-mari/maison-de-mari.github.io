"use client";

import { useEffect, useRef } from "react";

/**
 * Снег в три слоя, как в объективе:
 *  • задний — мелкие резкие хлопья, медленно, ПОЗАДИ флаконов и текста (между фоном и страницей);
 *  • средний — хлопья побольше, чуть мягче, поверх страницы;
 *  • передний — редкие крупные размытые хлопья у самой «камеры», быстрые.
 * Глубина видна по движению: при прокрутке и от «ветра» мыши ближние слои сдвигаются сильнее дальних.
 * Мышь — как дуновение: хлопья рядом с курсором сдувает по направлению движения, потом воздух их тормозит.
 * Лёгкий: хлопья нарисованы заранее (спрайты), 2D-холсты в разрешении 1×, ≤60 кадров/с, пауза на скрытой вкладке;
 * при «уменьшить движение» снега нет. Клики проходят сквозь холсты.
 */
type Layer = {
  count: number;
  size: [number, number]; // радиус хлопка, px
  blur: [number, number]; // размытие «не в фокусе», px
  alpha: number;
  fall: [number, number]; // скорость падения, px/с
  sway: number; // размах покачивания, px
  wind: number; // насколько слой слушается ветра и мыши
  scroll: number; // параллакс прокрутки (1 — вместе со страницей)
  back: boolean; // рисовать на заднем холсте (за страницей)
  shade: number; // сила холодной тени — чтобы белое читалось на светлом фоне
};

const LAYERS: Layer[] = [
  { count: 80, size: [1.4, 2.4], blur: [0, 0], alpha: 0.85, fall: [12, 22], sway: 7, wind: 0.35, scroll: 0.25, back: true, shade: 0.75 },
  { count: 42, size: [2.4, 4], blur: [0.4, 1.2], alpha: 0.9, fall: [30, 50], sway: 16, wind: 0.8, scroll: 0.6, back: false, shade: 0.55 },
  { count: 9, size: [10, 17], blur: [4, 7], alpha: 0.75, fall: [80, 115], sway: 30, wind: 1.4, scroll: 1.25, back: false, shade: 0.4 },
];

type Flake = { x: number; y: number; vx: number; vy: number; fall: number; ph: number; spr: HTMLCanvasElement; L: Layer };

/** неровный хлопок: несколько мягких пятен, холодная тень снизу справа; blur — размытие «не в фокусе» */
function flakeSprite(size: number, blur: number, seed: number, shade: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const pad = Math.ceil(blur * 2.5 + size * 0.6 + 3);
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size * 2 + pad * 2);
  const x = c.getContext("2d")!;
  const m = c.width / 2;
  x.filter = blur > 0.3 ? `blur(${blur}px)` : "none";
  const blobs: [number, number, number][] = [[0, 0, size]];
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = size * (0.3 + rnd() * 0.35);
    blobs.push([Math.cos(a) * d, Math.sin(a) * d, size * (0.45 + rnd() * 0.3)]);
  }
  for (const [bx, by, br] of blobs) {
    const g = x.createRadialGradient(m + bx + size * 0.18, m + by + size * 0.22, 0, m + bx + size * 0.18, m + by + size * 0.22, br * 1.1);
    g.addColorStop(0, `rgba(105,115,135,${shade})`);
    g.addColorStop(1, "rgba(105,115,135,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
  }
  for (const [bx, by, br] of blobs) {
    const g = x.createRadialGradient(m + bx - br * 0.15, m + by - br * 0.15, 0, m + bx, m + by, br);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(252,253,255,0.9)");
    g.addColorStop(1, "rgba(245,248,252,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function Snow() {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cb = backRef.current;
    const cf = frontRef.current;
    if (!cb || !cf || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const xb = cb.getContext("2d")!;
    const xf = cf.getContext("2d")!;
    const touch = window.matchMedia("(pointer: coarse)").matches;

    // по 4 спрайта на слой, размеры внутри диапазона слоя
    const sprites = LAYERS.map((L, li) =>
      Array.from({ length: 4 }, (_, k) => flakeSprite(lerp(L.size[0], L.size[1], k / 3), lerp(L.blur[0], L.blur[1], k / 3), 17 + li * 131 + k * 29, L.shade)),
    );

    let w = 0;
    let h = 0;
    const flakes: Flake[] = [];
    const spawn = (L: Layer, li: number, top: boolean): Flake => {
      const fall = lerp(L.fall[0], L.fall[1], Math.random());
      const spr = sprites[li][Math.floor(Math.random() * 4)];
      return { x: Math.random() * w, y: top ? -spr.height - Math.random() * 120 : Math.random() * h, vx: 0, vy: fall, fall, ph: Math.random() * 6.283, spr, L };
    };
    const resize = () => {
      w = cb.width = cf.width = window.innerWidth;
      h = cb.height = cf.height = window.innerHeight;
      if (!flakes.length)
        LAYERS.forEach((L, li) => {
          const n = Math.max(3, Math.round(L.count * (touch ? 0.5 : 1)));
          for (let i = 0; i < n; i++) flakes.push(spawn(L, li, false));
        });
    };
    resize();
    window.addEventListener("resize", resize);

    // мышь как ветер: скорость курсора (сглаженная), затухает, когда мышь замирает
    const mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (mouse.x > -1e3) {
        const dt = Math.max(8, now - mouse.t) / 1000;
        mouse.vx += ((e.clientX - mouse.x) / dt - mouse.vx) * 0.35;
        mouse.vy += ((e.clientY - mouse.y) / dt - mouse.vy) * 0.35;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.t = now;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // прокрутка: слои сдвигаются с разной силой — глубина
    let lastScroll = window.scrollY;
    let scrollD = 0;
    const onScroll = () => {
      scrollD += window.scrollY - lastScroll;
      lastScroll = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    let raf = 0;
    let prev = 0;
    let t = 0;
    const R = 180; // радиус дуновения, px
    const idx = new Map(LAYERS.map((L, i) => [L, i]));
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (prev && now - prev < 15.5) return;
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      t += dt;
      const fade = Math.exp(-dt * 5);
      mouse.vx *= fade;
      mouse.vy *= fade;
      const ms = Math.hypot(mouse.vx, mouse.vy);
      const gust = Math.sin(t * 0.21) * 9 + Math.sin(t * 0.53 + 1.3) * 5; // медленные порывы
      const sd = scrollD;
      scrollD = 0;
      const drag = 1 - Math.exp(-dt * 1.6);

      xb.clearRect(0, 0, w, h);
      xf.clearRect(0, 0, w, h);
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        const L = f.L;
        const sway = Math.sin(t * (0.5 + L.wind * 0.3) + f.ph) * L.sway;
        f.vx += ((gust + sway) * L.wind - f.vx) * drag;
        f.vy += (f.fall - f.vy) * drag;
        if (ms > 30) {
          const dx = f.x - mouse.x;
          const dy = f.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const dist = Math.sqrt(d2);
            const near = 1 - dist / R;
            const k = near * near * L.wind * dt * 6;
            f.vx += mouse.vx * k + (dx / (dist + 1)) * ms * k * 0.15;
            f.vy += mouse.vy * k + (dy / (dist + 1)) * ms * k * 0.15;
          }
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt - sd * L.scroll;
        const half = f.spr.width / 2;
        if (f.y - half > h + 40 || f.y + half < -260) {
          flakes[i] = spawn(L, idx.get(L)!, f.y > 0);
          if (f.y + half < -260) flakes[i].y = h + half; // ушёл вверх при прокрутке — возвращаем снизу
          continue;
        }
        if (f.x < -half - 40) f.x += w + half * 2 + 80;
        else if (f.x > w + half + 40) f.x -= w + half * 2 + 80;
        const ctx = L.back ? xb : xf;
        ctx.globalAlpha = L.alpha;
        ctx.drawImage(f.spr, f.x - half, f.y - half);
      }
      xb.globalAlpha = 1;
      xf.globalAlpha = 1;
    };
    const start = () => {
      if (!raf && !document.hidden) {
        prev = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const vis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else start();
    };
    document.addEventListener("visibilitychange", vis);
    start();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <>
      {/* задний слой — за страницей, над фоном-бумагой */}
      <canvas ref={backRef} aria-hidden className="pointer-events-none fixed inset-0 -z-[5] h-full w-full" />
      {/* средний и передний — поверх страницы */}
      <canvas ref={frontRef} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />
    </>
  );
}

export default Snow;
