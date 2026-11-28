"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/**
 * Свечение курсора (только с мышью): мягкий естественный свет — нейтрально-белый, ровное пятно с плавным спадом, без яркого ядра, следует за мышью.
 * Без цвета, без мерцания и без затемнения вокруг. Цвет и сила — токены --glow-* в globals.css (светлая/тёмная тема).
 * Только transform/opacity — без перерисовки страницы; клики проходят насквозь.
 */
export function CursorGlow() {
  const root = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      gsap.set(halo.current, { xPercent: -50, yPercent: -50, x: -999, y: -999 });
      const hx = gsap.quickTo(halo.current, "x", { duration: reduce ? 0.001 : 0.3, ease: "power3" });
      const hy = gsap.quickTo(halo.current, "y", { duration: reduce ? 0.001 : 0.3, ease: "power3" });

      let shown = false;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        if (!shown) {
          shown = true;
          gsap.set(halo.current, { x: e.clientX, y: e.clientY });
          gsap.to(root.current, { autoAlpha: 1, duration: 0.6 });
        }
        hx(e.clientX);
        hy(e.clientY);
      };
      const onLeave = () => {
        shown = false;
        gsap.to(root.current, { autoAlpha: 0, duration: 0.4 });
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      return () => {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} aria-hidden className="pointer-events-none invisible fixed inset-0 z-[45] overflow-hidden opacity-0">
      <div
        ref={halo}
        className="absolute left-0 top-0 size-[480px] rounded-full"
        style={{
          // ровное мягкое пятно без яркого ядра в центре (ядро на тёмных флаконах выглядело белым кружком)
          background: "radial-gradient(circle, var(--glow-a) 0%, var(--glow-b) 28%, var(--glow-c) 52%, transparent 72%)",
          mixBlendMode: "var(--glow-blend)" as React.CSSProperties["mixBlendMode"],
        }}
      />
    </div>
  );
}

export default CursorGlow;
