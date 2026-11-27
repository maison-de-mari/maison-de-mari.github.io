"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Бегущая сетка на шейдере — фон витрины: белый фон, чёрные линии.
 * Чтобы не лагало: разрешение 1×, не чаще 30 кадров в секунду, пауза, когда фон не виден или вкладка скрыта;
 * при «уменьшить движение» — один неподвижный кадр.
 */
type Props = {
  className?: string;
  /** скорость прокрутки (1 — как в оригинале) */
  speed?: number;
};

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 resolution;
uniform float time;
void main(void) {
  vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
  uv.x += time * 0.1;
  float s = 12.0, e = 9e-4;
  // яркость линий из оригинала, перевёрнутая: белый фон, чёрные линии
  float line = clamp(e / (sin(uv.x * s) * cos(uv.y * s)), 0.0, 1.0);
  gl_FragColor = vec4(vec3(1.0 - line), 1.0);
}`;

export function ScrollingGridShader({ className = "", speed = 1 }: Props) {
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
    const uniforms = { time: { value: 1 }, resolution: { value: new THREE.Vector2() } };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(geometry, material));

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let shown = true;
    const t0 = performance.now();

    const draw = (now: number) => {
      uniforms.time.value = 1 + ((now - t0) / 1000) * 0.6 * speed;
      renderer.render(scene, camera);
    };
    const loop = (now: number) => {
      raf = 0;
      if (!shown || document.hidden) return;
      if (now - last >= 33) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (still) draw(performance.now());
      else if (!raf) raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      shown = e.isIntersecting;
      if (shown) start();
    });
    io.observe(el);
    const vis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", vis);
    resize();
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [speed]);

  return <div ref={ref} aria-hidden className={`relative overflow-hidden bg-white ${className}`} />;
}

export default ScrollingGridShader;
