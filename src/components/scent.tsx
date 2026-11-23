"use client";

import { useEffect, useRef } from "react";

/**
 * Декор парфюмерного бутика — «шлейф аромата».
 * Тонкие золотые изгибы медленно плывут, в воздухе поднимаются мелкие искры,
 * а курсор над блоком оставляет облачко золотого распыла, как от пшика флакона.
 * Ставится первым ребёнком в блок с relative + isolate + overflow-hidden.
 */
type Speck = { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number; born: number; mist: boolean };

export function Scent({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const host = c?.parentElement?.parentElement;
    if (!c || !host) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gold = tone === "dark" ? "232, 200, 140" : "184, 138, 62";

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const specks: Speck[] = [];
    const ambient = () => ({
      x: Math.random() * w,
      y: h + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.15 + Math.random() * 0.35),
      r: 0.6 + Math.random() * 1.6,
      a: 0.25 + Math.random() * 0.5,
      life: 9000 + Math.random() * 9000,
      born: performance.now() - Math.random() * 9000,
      mist: false,
    });
    for (let i = 0; i < 46; i++) {
      const s = ambient();
      s.y = Math.random() * h;
      specks.push(s);
    }

    let raf = 0;
    let visible = true;
    const draw = () => {
      const now = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = specks.length - 1; i >= 0; i--) {
        const s = specks[i];
        const age = (now - s.born) / s.life;
        if (age >= 1 || s.y < -10) {
          if (s.mist) specks.splice(i, 1);
          else Object.assign(s, ambient());
          continue;
        }
        s.x += s.vx + Math.sin((now + i * 400) / 1800) * 0.08;
        s.y += s.vy;
        if (s.mist) {
          s.vx *= 0.97;
          s.vy = s.vy * 0.97 - 0.004;
        }
        const fade = Math.sin(Math.min(1, age) * Math.PI);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * (s.mist ? 3 : 2.4));
        g.addColorStop(0, `rgba(${gold}, ${s.a * fade})`);
        g.addColorStop(1, `rgba(${gold}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (s.mist ? 3 : 2.4), 0, Math.PI * 2);
        ctx.fill();
      }
      raf = visible && !reduce ? requestAnimationFrame(draw) : 0;
    };
    draw();

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(host);

    // курсор над блоком — облачко золотого распыла
    let last = 0;
    const onMove = (e: PointerEvent) => {
      if (reduce || e.pointerType === "touch") return;
      const now = performance.now();
      if (now - last < 24) return;
      last = now;
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const v = 0.3 + Math.random() * 0.9;
        specks.push({
          x, y,
          vx: Math.cos(ang) * v,
          vy: Math.sin(ang) * v - 0.25,
          r: 0.8 + Math.random() * 2.2,
          a: 0.35 + Math.random() * 0.45,
          life: 1400 + Math.random() * 1400,
          born: now,
          mist: true,
        });
      }
      if (specks.length > 420) specks.splice(46, specks.length - 420);
    };
    host.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
    };
  }, [tone]);

  const stroke = tone === "dark" ? "#e8c88c" : "#b88a3e";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* шлейф: три плавные золотые дымки */}
      <svg className="scent-wisps absolute inset-0 size-full" viewBox="0 0 1200 600" preserveAspectRatio="none">
        <defs>
          <linearGradient id="scent-fade" x1="0" x2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0" />
            <stop offset="0.35" stopColor={stroke} stopOpacity="0.55" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="wisp wisp-1" d="M-40 470 C 220 380, 380 560, 620 430 S 980 250, 1260 330" />
        <path className="wisp wisp-2" d="M-40 520 C 260 470, 420 330, 700 400 S 1020 520, 1260 420" />
        <path className="wisp wisp-3" d="M-40 410 C 180 300, 460 420, 740 300 S 1060 180, 1260 250" />
      </svg>
      <canvas ref={canvas} className="absolute inset-0 size-full" />
    </div>
  );
}
