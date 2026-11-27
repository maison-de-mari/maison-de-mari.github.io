"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cssColor, onTheme } from "@/lib/theme";

/**
 * Фон всего сайта — матовая бумага, под которой спрятан гипсовый барельеф на всю высоту страницы:
 * три снимка (розы и жасмин с бантом; лаванда и пионы; ирисы и плетистая роза с бабочкой) друг под другом,
 * без повторов. Снимки подготовлены заранее: освещение выровнено до ровной бумаги (128 ≈ «как бумага»),
 * сверху и снизу — плавный переход в ровную бумагу, поэтому стыков не видно.
 * В покое — ровная бумага. Рельеф проступает только вокруг курсора мыши; когда мышь замирает,
 * он ещё немного держится и медленно тает (~4 с). Проявленное место привязано к странице: прокрутка ничего не проявляет.
 * На сенсорных экранах мыши нет — снимки не загружаются (только бумага). Кадры — только пока мышь двигается и рельеф тает.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SHEETS = ["/relief/r1.webp", "/relief/r2.webp", "/relief/r3.webp"];
const ASPECT = 2560 / 1440; // высота снимка к ширине

const vertexShader = /* glsl */ `
void main() { gl_Position = vec4(position, 1.0); }`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D r0;
uniform sampler2D r1;
uniform sampler2D r2;
uniform sampler2D mask;
uniform vec2 res;      // экран, px
uniform vec2 page;     // ширина и высота страницы, px
uniform float sheetH;  // высота одного снимка на странице, px
uniform float scroll;  // прокрутка, px
uniform float fade;    // общее «таяние» после остановки мыши (1 → 0)
uniform vec3 paperC;   // цвет бумаги (светлая или тёмно-серая тема)
uniform float lift;    // на тёмной бумаге рельеф проявляем сильнее
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  float py = scroll + res.y - fc.y;                 // точка на странице, сверху вниз
  float k = smoothstep(0.0, 1.0, texture2D(mask, vec2(fc.x / page.x, py / page.y)).a) * fade;
  vec3 paper = paperC;
  vec3 col = paper;
  if (k > 0.002) {
    float i = mod(floor(py / sheetH), 3.0);
    vec2 uv = vec2(fc.x / page.x, fract(py / sheetH));
    float v = i < 0.5 ? texture2D(r0, uv).r : i < 1.5 ? texture2D(r1, uv).r : texture2D(r2, uv).r;
    float ratio = 0.45 + v * 0.8;                   // как в подготовке снимков: 1.0 — ровная бумага
    col = paper * mix(1.0, ratio, k) + (ratio - 1.0) * k * lift;
  }
  col -= 0.012 * (hash(floor(fc)) - 0.5);           // зерно бумаги
  gl_FragColor = vec4(col, 1.0);
}`;

/** цвет токена (#rrggbb) → значения как есть, без перевода в линейное — шейдер выводит их напрямую */
const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const HOLD = 0.8; // с — рельеф держится после остановки мыши
const MELT = 3.4; // с — потом медленно тает

export function ReliefPaper({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // без мыши рельеф не нужен — только бумага
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    el.appendChild(renderer.domElement);

    // маска поднятого рельефа — на всю страницу, в 6 раз мельче
    const MS = 6;
    const mc = document.createElement("canvas");
    const mx = mc.getContext("2d")!;
    const newMask = () => {
      const t = new THREE.CanvasTexture(mc);
      t.flipY = false; // строки сверху вниз — как в шейдере
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };
    let maskTex = newMask();

    const blank = new THREE.DataTexture(new Uint8Array([140, 140, 140, 255]), 1, 1);
    blank.needsUpdate = true;
    const uniforms = {
      r0: { value: blank as THREE.Texture },
      r1: { value: blank as THREE.Texture },
      r2: { value: blank as THREE.Texture },
      mask: { value: maskTex as THREE.Texture },
      res: { value: new THREE.Vector2(1, 1) },
      page: { value: new THREE.Vector2(1, 1) },
      sheetH: { value: 1 },
      scroll: { value: 0 },
      fade: { value: 1 },
      paperC: { value: rgb(cssColor("--color-paper") || "#f1efea") },
      lift: { value: 0 },
    };
    uniforms.lift.value = document.documentElement.dataset.theme === "dark" ? 0.09 : 0;
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(geometry, material));

    const draw = () => {
      uniforms.scroll.value = window.scrollY;
      maskTex.needsUpdate = true;
      renderer.render(scene, camera);
    };

    // снимки грузим, когда браузер освободится после первой отрисовки страницы
    let loaded = 0;
    const textures: THREE.Texture[] = [];
    const load = () => {
      const loader = new THREE.TextureLoader();
      SHEETS.forEach((src, i) =>
        loader.load(BASE + src, (t) => {
          t.flipY = false; // строки сверху вниз
          t.colorSpace = THREE.NoColorSpace; // значения как есть — это не цвет, а «во сколько раз темнее бумаги»
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.anisotropy = 4;
          textures.push(t);
          (uniforms[`r${i}` as "r0" | "r1" | "r2"].value as THREE.Texture) = t;
          loaded++;
          draw();
        }),
      );
    };
    const idleId = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(load, { timeout: 2500 }) : window.setTimeout(load, 600);

    // размеры страницы: маска и высота снимка
    const fit = () => {
      const pw = document.documentElement.clientWidth;
      const ph = document.documentElement.scrollHeight;
      if (pw === uniforms.page.value.x && ph === uniforms.page.value.y) return;
      uniforms.page.value.set(pw, ph);
      uniforms.sheetH.value = pw * ASPECT;
      mc.width = Math.ceil(pw / MS);
      mc.height = Math.ceil(ph / MS);
      maskTex.dispose();
      maskTex = newMask();
      uniforms.mask.value = maskTex;
    };

    // мазки вокруг курсора
    let last: { x: number; y: number } | null = null;
    let lastClient = { x: -1, y: -1 };
    let lastMove = 0;
    let raf = 0;
    let prev = 0;
    const brush = (x: number, y: number) => {
      const r = 26; // ≈ 160 px на экране
      const gr = mx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.3)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      mx.fillStyle = gr;
      mx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      const idle = (now - lastMove) / 1000;
      if (idle < HOLD) {
        // пока мышь двигается, старый след за ней понемногу гаснет
        mx.globalCompositeOperation = "destination-out";
        mx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.45)})`;
        mx.fillRect(0, 0, mc.width, mc.height);
        mx.globalCompositeOperation = "source-over";
        uniforms.fade.value = 1;
      } else {
        // мышь замерла: весь рельеф плавно тает (мягкое замедление к концу)
        const t = Math.min(1, (idle - HOLD) / MELT);
        uniforms.fade.value = 1 - t * t * (3 - 2 * t);
      }
      draw();
      if (idle < HOLD + MELT) raf = requestAnimationFrame(tick);
      else {
        mx.clearRect(0, 0, mc.width, mc.height);
        uniforms.fade.value = 1;
        draw();
        prev = 0;
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || loaded < SHEETS.length) return;
      // браузер шлёт «движение» и при прокрутке колесом — курсор на месте, такие пропускаем
      if (e.clientX === lastClient.x && e.clientY === lastClient.y) return;
      lastClient = { x: e.clientX, y: e.clientY };
      fit();
      const p = { x: e.clientX / MS, y: (e.clientY + window.scrollY) / MS };
      // дрожание руки (пара пикселей) — не движение: мажем, только когда курсор ушёл от прошлого мазка на ≥12 px
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      // если рельеф уже таял — подхватываем: оставшееся видно как есть, след продолжается
      if (uniforms.fade.value < 1) {
        mx.globalCompositeOperation = "destination-out";
        mx.fillStyle = `rgba(0,0,0,${1 - uniforms.fade.value})`;
        mx.fillRect(0, 0, mc.width, mc.height);
        mx.globalCompositeOperation = "source-over";
        uniforms.fade.value = 1;
      }
      const d = last ? Math.hypot(p.x - last.x, p.y - last.y) : 0;
      if (last && d < 40) {
        const steps = Math.min(12, Math.ceil(d / 3));
        for (let i = 1; i <= steps; i++) brush(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps);
      } else brush(p.x, p.y);
      last = p;
      lastMove = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // прокрутка: только перерисовать (рельеф едет со страницей), ничего не проявляя
    let sraf = 0;
    const onScroll = () => {
      last = null;
      if (raf || sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        draw();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      uniforms.res.value.set(renderer.domElement.width, renderer.domElement.height);
      fit();
      draw();
    };
    // смена темы: бумага плавно перетекает в новый цвет
    let traf = 0;
    const offTheme = onTheme(() => {
      const from = uniforms.paperC.value.clone();
      const to = rgb(cssColor("--color-paper") || "#f1efea");
      const lift0 = uniforms.lift.value;
      const lift1 = document.documentElement.dataset.theme === "dark" ? 0.09 : 0;
      const t0 = performance.now();
      cancelAnimationFrame(traf);
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 700);
        const e = k * k * (3 - 2 * k);
        uniforms.paperC.value.lerpVectors(from, to, e);
        uniforms.lift.value = lift0 + (lift1 - lift0) * e;
        draw();
        if (k < 1) traf = requestAnimationFrame(step);
      };
      traf = requestAnimationFrame(step);
    });

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ro.observe(document.body);
    resize();

    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      window.clearTimeout(idleId);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sraf);
      ro.disconnect();
      offTheme();
      cancelAnimationFrame(traf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      maskTex.dispose();
      blank.dispose();
      textures.forEach((t) => t.dispose());
    };
  }, []);

  return <div ref={ref} aria-hidden className={`overflow-hidden ${className}`} style={{ background: "var(--color-paper)" }} />;
}

export default ReliefPaper;
