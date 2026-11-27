"use client";

import { useEffect, useRef } from "react";

/**
 * Падающий снег поверх сайта, как в объективе: дальние хлопья мелкие и резкие, ближние — крупные и размытые
 * (глубина резкости). Хлопья неровные, с лёгкой холодной тенью снизу — видны на светлом фоне.
 * Ветер: мягкие порывы качают весь снег, а движение мыши — как дуновение: хлопья рядом с курсором
 * сдувает по направлению движения, потом сопротивление воздуха возвращает их к спокойному падению.
 * Лёгкий: хлопья нарисованы заранее (спрайты), 2D-холст в разрешении 1×, не больше 60 кадров/с,
 * пауза на скрытой вкладке; при «уменьшить движение» снега нет. Клики проходят сквозь холст.
 */
type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number; // 0 — далеко, 1 — близко
  fall: number; // скорость спокойного падения, px/с
  ph: number;
  spr: HTMLCanvasElement;
  a: number;
};

/** неровный хлопок: несколько мягких пятен, холодная тень снизу справа; blur — размытие «не в фокусе» */
function flakeSprite(size: number, blur: number, seed: number) {
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
  // тень — на сантиметр ниже и правее, холодно-серая
  for (const [bx, by, br] of blobs) {
    const g = x.createRadialGradient(m + bx + size * 0.18, m + by + size * 0.22, 0, m + bx + size * 0.18, m + by + size * 0.22, br * 1.1);
    g.addColorStop(0, "rgba(120,130,150,0.28)");
    g.addColorStop(1, "rgba(120,130,150,0)");
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

export function Snow({ count = 90 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d")!;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const n = touch ? Math.round(count * 0.5) : count;

    // спрайты по слоям глубины: [размер, размытие]
    const layers: [number, number][] = [
      [1.6, 0],
      [2.4, 0],
      [3.4, 0.4],
      [5, 1.2],
      [8, 3],
      [13, 6],
    ];
    const sprites = layers.map(([sz, bl], li) => Array.from({ length: 4 }, (_, k) => flakeSprite(sz, bl, 11 + li * 97 + k * 31)));

    let w = 0;
    let h = 0;
    const flakes: Flake[] = [];
    const spawn = (top: boolean): Flake => {
      // ближних мало, дальних много
      const depth = Math.pow(Math.random(), 1.8);
      const li = Math.min(layers.length - 1, Math.floor(depth * layers.length));
      const fall = 16 + depth * 70;
      return {
        x: Math.random() * w,
        y: top ? -30 - Math.random() * 80 : Math.random() * h,
        vx: 0,
        vy: fall,
        depth,
        fall,
        ph: Math.random() * Math.PI * 2,
        spr: sprites[li][Math.floor(Math.random() * 4)],
        a: li >= 4 ? 0.55 : 0.75 + depth * 0.25,
      };
    };
    const resize = () => {
      w = cv.width = window.innerWidth;
      h = cv.height = window.innerHeight;
      if (!flakes.length) for (let i = 0; i < n; i++) flakes.push(spawn(false));
    };
    resize();
    window.addEventListener("resize", resize);

    // мышь как ветер: скорость курсора (сглаженная), затухает, когда мышь замирает
    const mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (mouse.x > -1e3) {
        const dt = Math.max(8, now - mouse.t) / 1000;
        const k = 0.35;
        mouse.vx += ((e.clientX - mouse.x) / dt - mouse.vx) * k;
        mouse.vy += ((e.clientY - mouse.y) / dt - mouse.vy) * k;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.t = now;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let prev = 0;
    let t = 0;
    const R = 170; // радиус дуновения, px
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (prev && now - prev < 15.5) return;
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      t += dt;
      // ветер мыши затихает
      const fade = Math.exp(-dt * 5);
      mouse.vx *= fade;
      mouse.vy *= fade;
      const ms = Math.hypot(mouse.vx, mouse.vy);
      // общий ветер: медленные порывы
      const gust = Math.sin(t * 0.21) * 9 + Math.sin(t * 0.53 + 1.3) * 5;

      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        const sway = Math.sin(t * (0.5 + f.depth * 0.6) + f.ph) * (10 + f.depth * 18);
        const tx = (gust + sway) * (0.4 + f.depth);
        // сопротивление воздуха тянет к спокойному падению
        const drag = 1 - Math.exp(-dt * 1.6);
        f.vx += (tx - f.vx) * drag;
        f.vy += (f.fall - f.vy) * drag;
        // дуновение от курсора: по направлению движения мыши, сильнее рядом и у ближних хлопьев
        if (ms > 30) {
          const dx = f.x - mouse.x;
          const dy = f.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const fall = 1 - Math.sqrt(d2) / R;
            const k = fall * fall * (0.5 + f.depth) * dt * 7;
            f.vx += mouse.vx * k + (dx / (Math.sqrt(d2) + 1)) * ms * k * 0.15;
            f.vy += mouse.vy * k + (dy / (Math.sqrt(d2) + 1)) * ms * k * 0.15;
          }
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const half = f.spr.width / 2;
        if (f.y - half > h || f.y < -400) {
          flakes[i] = spawn(true);
          continue;
        }
        if (f.x < -half - 40) f.x += w + half * 2 + 80;
        else if (f.x > w + half + 40) f.x -= w + half * 2 + 80;
        ctx.globalAlpha = f.a;
        ctx.drawImage(f.spr, f.x - half, f.y - half);
      }
      ctx.globalAlpha = 1;
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
      document.removeEventListener("visibilitychange", vis);
    };
  }, [count]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />;
}

export default Snow;
