"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/**
 * Курсор-фонарь (только с мышью): тёплое сияние плавно следует за курсором и чуть мерцает, как пламя;
 * у кончика курсора — яркий огонёк; над кнопками и ссылками свет разгорается сильнее.
 * В тёмной теме — как фонарь в темноте: вокруг света страница слегка темнее (см. globals.css, --glow-*).
 * Всё — только transform/opacity (без перерисовки страницы), клики проходят насквозь.
 * При «уменьшить движение» свет следует без задержки и не мерцает.
 */
export function CursorGlow() {
  const root = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const dark = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lag = reduce ? 0.001 : 0.45;
      const els = [halo.current, dark.current];
      gsap.set([...els, core.current], { xPercent: -50, yPercent: -50, x: -999, y: -999 });
      // сияние и «темнота» вокруг — с мягкой задержкой, огонёк — почти сразу
      const hx = gsap.quickTo(els, "x", { duration: lag, ease: "power3" });
      const hy = gsap.quickTo(els, "y", { duration: lag, ease: "power3" });
      const cx = gsap.quickTo(core.current, "x", { duration: reduce ? 0.001 : 0.08, ease: "power2" });
      const cy = gsap.quickTo(core.current, "y", { duration: reduce ? 0.001 : 0.08, ease: "power2" });

      let shown = false;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        if (!shown) {
          shown = true;
          gsap.set([...els, core.current], { x: e.clientX, y: e.clientY });
          gsap.to(root.current, { autoAlpha: 1, duration: 0.6 });
        }
        hx(e.clientX);
        hy(e.clientY);
        cx(e.clientX);
        cy(e.clientY);
      };
      const onLeave = () => {
        shown = false;
        gsap.to(root.current, { autoAlpha: 0, duration: 0.4 });
      };
      // над кнопками, ссылками и флаконами свет разгорается
      let hot = false;
      const onOver = (e: PointerEvent) => {
        const t = e.target as Element | null;
        const h = !!t?.closest("a, button, [role='img'], canvas, label");
        if (h === hot) return;
        hot = h;
        gsap.to(halo.current, { scale: h ? 1.3 : 1, duration: 0.5, ease: "power2.out" });
        gsap.to(core.current, { scale: h ? 1.8 : 1, duration: 0.35, ease: "power2.out" });
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerover", onOver, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      // пламя: свет едва заметно дышит и подрагивает
      if (!reduce) {
        gsap.to(halo.current, {
          opacity: "random(0.82, 1)",
          duration: "random(0.12, 0.35)",
          ease: "sine.inOut",
          repeat: -1,
          repeatRefresh: true,
        });
      }
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerover", onOver);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} aria-hidden className="pointer-events-none invisible fixed inset-0 z-[45] overflow-hidden opacity-0">
      {/* тёмная тема: всё вокруг света чуть темнее — как фонарь в ночи */}
      <div
        ref={dark}
        className="absolute left-0 top-0 size-[300vmax]"
        style={{ background: "radial-gradient(circle, transparent 0, transparent 7%, var(--glow-dark) 22%)", opacity: "var(--glow-dark-on)" }}
      />
      {/* тёплое сияние */}
      <div
        ref={halo}
        className="absolute left-0 top-0 size-[560px] rounded-full"
        style={{
          background: "radial-gradient(circle, var(--glow-a) 0%, var(--glow-b) 28%, transparent 62%)",
          mixBlendMode: "var(--glow-blend)" as React.CSSProperties["mixBlendMode"],
        }}
      />
      {/* огонёк у кончика курсора */}
      <div
        ref={core}
        className="absolute left-0 top-0 size-2.5 rounded-full bg-[#fff3d6] shadow-[0_0_10px_3px_rgba(255,206,120,0.85),0_0_26px_8px_rgba(255,180,80,0.35)]"
      />
    </div>
  );
}

export default CursorGlow;
