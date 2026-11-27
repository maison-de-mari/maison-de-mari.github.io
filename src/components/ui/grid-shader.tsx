"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Сетка на шейдере — фон всего сайта: белый фон, чёрные линии. Стоит на месте и едва просвечивает,
 * а вокруг курсора проявляется ярче — пятно плавно следует за мышью и гаснет, когда мышь замирает.
 * Рисуется только когда что-то меняется (движение мыши, размер окна) — в покое ноль кадров.
 */
type Props = {
  className?: string;
  /** насколько видна сетка в покое (0…1) */
  base?: number;
  /** радиус пятна у курсора, px */
  radius?: number;
};

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 resolution;
uniform vec2 mouse;
uniform float spot;
uniform float radius;
uniform float base;
void main(void) {
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
  uv.x += 0.1;
  float s = 12.0, e = 9e-4;
  // яркость линий из оригинала, перевёрнутая: белый фон, чёрные линии
  float line = clamp(e / (sin(uv.x * s) * cos(uv.y * s)), 0.0, 1.0);
  float d = distance(gl_FragCoord.xy, mouse);
  float k = mix(base, 1.0, spot * exp(-(d * d) / (radius * radius)));
  gl_FragColor = vec4(vec3(1.0 - line * k), 1.0);
}`;

export function ScrollingGridShader({ className = "", base = 0.22, radius = 280 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      resolution: { value: new THREE.Vector2() },
      mouse: { value: new THREE.Vector2(-9999, -9999) },
      spot: { value: 0 },
      radius: { value: radius },
      base: { value: base },
    };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(geometry, material));
    const draw = () => renderer.render(scene, camera);

    // пятно у курсора: догоняет мышь и гаснет через секунду после остановки
    const target = new THREE.Vector2(-9999, -9999);
    let lastMove = 0;
    let raf = 0;
    let prev = 0;
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - (prev || now)) / 1000);
      prev = now;
      const m = uniforms.mouse.value;
      if (m.x < -9000) m.copy(target);
      else m.lerp(target, 1 - Math.exp(-dt * 14));
      const want = now - lastMove < 900 ? 1 : 0;
      uniforms.spot.value += (want - uniforms.spot.value) * (1 - Math.exp(-dt * (want ? 6 : 2.2)));
      draw();
      const settled = !want && uniforms.spot.value < 0.003 && m.distanceTo(target) < 0.5;
      if (settled) {
        uniforms.spot.value = 0;
        draw();
        prev = 0;
      } else raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      target.set(e.clientX - r.left, r.bottom - e.clientY); // в координатах шейдера ось Y снизу вверх
      lastMove = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) window.addEventListener("pointermove", onMove, { passive: true });

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [base, radius]);

  return <div ref={ref} aria-hidden className={`relative overflow-hidden bg-white ${className}`} />;
}

export default ScrollingGridShader;
