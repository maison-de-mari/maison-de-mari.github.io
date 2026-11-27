"use client";

import { useEffect, useRef } from "react";

/**
 * Падающий снег поверх сайта: мягкие хлопья разного размера медленно падают и покачиваются,
 * дальние — мельче, бледнее и медленнее. Сайт белый, поэтому хлопья — белые с лёгкой серой тенью.
 * Лёгкий: хлопья нарисованы заранее (несколько спрайтов), 2D-холст в разрешении 1×, не больше 60 кадров/с,
 * пауза на скрытой вкладке; при «уменьшить движение» снега нет. Клики проходят сквозь холст.
 */
type Flake = { x: number; y: number; r: number; vy: number; sway: number; ph: number; spr: number; a: number };

function sprite(size: number, blur: number) {
  const pad = Math.ceil(blur * 2 + 2);
  const c = document.createElement("canvas");
  c.width = c.height = size * 2 + pad * 2;
  const x = c.getContext("2d")!;
  const m = c.width / 2;
  // тень — чтобы белое было видно на белом
  x.shadowColor = "rgba(70,60,50,0.55)";
  x.shadowBlur = blur;
  const g = x.createRadialGradient(m, m, 0, m, m, size);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.6, "rgba(255,255,255,0.95)");
  g.addColorStop(1, "rgba(255,255,255,0.0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(m, m, size, 0, Math.PI * 2);
  x.fill();
  return c;
}

export function Snow({ count = 70 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d")!;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const n = touch ? Math.round(count * 0.5) : count;
    const sprites = [sprite(3, 3), sprite(4.5, 4), sprite(6.5, 5), sprite(9, 6)];
    let w = 0;
    let h = 0;
    const flakes: Flake[] = [];
    const spawn = (f: Partial<Flake> = {}, top = false): Flake => {
      const depth = Math.random(); // 0 — далеко, 1 — близко
      const spr = Math.min(3, Math.floor(depth * 4));
      return {
        x: Math.random() * w,
        y: top ? -20 - Math.random() * 60 : Math.random() * h,
        r: sprites[spr].width / 2,
        vy: 18 + depth * 42, // px/с
        sway: 8 + depth * 22,
        ph: Math.random() * Math.PI * 2,
        spr,
        a: 0.6 + depth * 0.4,
        ...f,
      };
    };
    const resize = () => {
      w = cv.width = window.innerWidth;
      h = cv.height = window.innerHeight;
      if (!flakes.length) for (let i = 0; i < n; i++) flakes.push(spawn());
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let prev = 0;
    let t = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - prev < 15.5) return;
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      t += dt;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.vy * dt;
        const x = f.x + Math.sin(t * 0.6 + f.ph) * f.sway;
        if (f.y - f.r > h) {
          flakes[i] = spawn({}, true);
          continue;
        }
        ctx.globalAlpha = f.a;
        ctx.drawImage(sprites[f.spr], x - f.r, f.y - f.r);
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
      document.removeEventListener("visibilitychange", vis);
    };
  }, [count]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-30 h-full w-full" />;
}

export default Snow;
