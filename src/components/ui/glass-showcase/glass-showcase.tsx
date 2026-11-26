"use client";

/**
 * Витрина фотореалистичных стеклянных флаконов (Three.js).
 * Один общий canvas на все карточки: каждая карточка рисуется в свой прямоугольник (scissor/viewport).
 * Рисуется только видимое и только пока что-то движется: в покое — ни одного кадра; наведение, перетаскивание,
 * появление карточки на экране — запускают рендер снова. На телефоне разрешение ≤ 1.5.
 * Без WebGL или при «уменьшить движение» — обычные фото флаконов.
 *
 * Мышь: наведение слегка наклоняет флакон к курсору, перетаскивание крутит его.
 * Палец: горизонтальное движение по флакону крутит его, вертикальное — прокручивает страницу как обычно.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { aromas, getAroma, minSum, minUsd } from "@/data/aromas";
import { sum } from "@/lib/cart";
import { buildBottle, softboxEnv, type Bottle3D, type Bottle3DSpec } from "./bottle3d";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const BG = "#efeae2";

function webglOk() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function GlassShowcase({ items }: { items: Bottle3DSpec[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stages = useRef<(HTMLDivElement | null)[]>([]);
  const [mode, setMode] = useState<"3d" | "photo" | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- режим известен только в браузере
    setMode(!reduce && webglOk() ? "3d" : "photo");
  }, []);

  useEffect(() => {
    if (mode !== "3d") return;
    const host = wrap.current!;
    const cv = canvas.current!;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !touch, alpha: true, powerPreference: "high-performance" });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL не создался — показываем фото
      setMode("photo");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 1.75));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setScissorTest(true);
    const env = softboxEnv(renderer);
    const loader = new THREE.TextureLoader();

    type Card = { el: HTMLDivElement; b: Bottle3D; cam: THREE.PerspectiveCamera; visible: boolean; hover: boolean; drag: { x: number; sx: number; sy: number; id: number } | null };
    const cards: Card[] = [];
    items.forEach((spec, i) => {
      const el = stages.current[i];
      if (!el) return;
      let tex: THREE.Texture | undefined;
      if (spec.label) {
        // этикетка грузится позже первого кадра — после загрузки перерисовать
        tex = loader.load(`${BASE}${spec.label}`, () => {
          force = true;
          kick();
        });
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
      }
      const b = buildBottle(spec, BG, env, tex);
      cards.push({ el, b, cam: new THREE.PerspectiveCamera(27, 1, 0.1, 100), visible: false, hover: false, drag: null });
    });

    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let force = true; // нарисовать кадр даже без движения (появление, изменение размера)

    const size = () => {
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      force = true;
      kick();
    };

    const draw = () => {
      const c = cv.getBoundingClientRect();
      renderer.setScissor(0, 0, c.width, c.height);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      for (const k of cards) {
        if (!k.visible) continue;
        const r = k.el.getBoundingClientRect();
        const x = r.left - c.left;
        const y = c.height - (r.bottom - c.top);
        renderer.setViewport(x, y, r.width, r.height);
        renderer.setScissor(x, y, r.width, r.height);
        k.b.fit(k.cam, r.width / r.height);
        renderer.render(k.b.scene, k.cam);
      }
    };

    const tick = (now: number) => {
      raf = 0;
      // не чаще 60 кадров в секунду на любом экране
      if (last && now - lastDraw < 15.5) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      lastDraw = now;
      let moving = false;
      for (const k of cards) {
        if (!k.visible) continue;
        if (k.hover || k.drag || k.b.energy() > 0.004) {
          k.b.step(dt);
          moving = true;
        }
      }
      if (moving || force) draw();
      force = false;
      if (moving) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    function kick() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const k = cards.find((c) => c.el === e.target);
        if (k) k.visible = e.isIntersecting;
      }
      force = true;
      kick();
    });
    cards.forEach((k) => io.observe(k.el));
    const ro = new ResizeObserver(size);
    ro.observe(host);
    size();

    // ── управление
    const offs: (() => void)[] = [];
    for (const k of cards) {
      const el = k.el;
      const s = k.b.state;
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (k.drag && e.pointerId === k.drag.id) {
          const dx = e.clientX - k.drag.x;
          k.drag.x = e.clientX;
          s.yaw += dx * 0.008;
          s.yawV = dx * 0.5;
          s.vx += dx * 0.012;
          if (e.pointerType !== "touch") {
            s.ttz = Math.max(-0.42, Math.min(0.42, -(e.clientX - k.drag.sx) * 0.0032));
            s.ttx = Math.max(-0.3, Math.min(0.3, (e.clientY - k.drag.sy) * 0.0032));
          }
          kick();
          return;
        }
        if (e.pointerType === "touch") return;
        // наведение: флакон слегка наклоняется к курсору
        const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
        s.ttz = -px * 0.16;
        s.ttx = py * 0.08;
        k.hover = true;
        kick();
      };
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        k.drag = { x: e.clientX, sx: e.clientX, sy: e.clientY, id: e.pointerId };
        if (e.pointerType !== "touch") el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
      };
      const onUp = () => {
        if (!k.drag) return;
        k.drag = null;
        el.style.cursor = "grab";
        if (!k.hover) s.ttx = s.ttz = 0;
        kick();
      };
      const onLeave = () => {
        k.hover = false;
        if (!k.drag) s.ttx = s.ttz = 0;
        kick();
      };
      const onTouchCancel = () => {
        // браузер забрал жест на прокрутку страницы
        k.drag = null;
      };
      el.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerdown", onDown, { passive: true });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onTouchCancel);
      el.addEventListener("pointerleave", onLeave);
      offs.push(() => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onTouchCancel);
        el.removeEventListener("pointerleave", onLeave);
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      offs.forEach((f) => f());
      cards.forEach((k) => k.b.dispose());
      env.dispose();
      renderer.dispose();
    };
  }, [mode, items]);

  return (
    <div ref={wrap} className="relative">
      {mode === "3d" && <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />}
      <ul className="relative grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((spec, i) => {
          const a = getAroma(spec.slug) ?? aromas[0];
          const price = a.usd ? `от ${minUsd(a)} $` : `от ${sum(minSum(a))}`;
          return (
            <li key={spec.slug} className="flex flex-col items-center">
              <div
                ref={(n) => {
                  stages.current[i] = n;
                }}
                role="img"
                aria-label={`${a.brand} ${a.name}: стеклянный флакон, потяните, чтобы повернуть`}
                className="relative aspect-[3/4] w-full cursor-grab overflow-hidden rounded-2xl [touch-action:pan-y]"
                style={{ background: mode === "3d" ? "transparent" : BG }}
              >
                {mode === "photo" && (
                  // eslint-disable-next-line @next/next/no-img-element -- статический экспорт
                  <img src={`${BASE}/ring/${spec.slug}-front.webp`} alt="" className="absolute inset-[8%] size-[84%] object-contain" />
                )}
              </div>
              <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.24em] text-gold">{a.brand}</p>
              <p className="mt-1 w-full truncate text-center text-[15px]">{a.name}</p>
              <p className="mt-0.5 text-[13px] text-soft tabular-nums">{price}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default GlassShowcase;
