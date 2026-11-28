"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { smearTargets } from "@/lib/smear";
import { onTheme } from "@/lib/theme";

/**
 * Курсор размазывает крупные заголовки, как на immersive-g.com.
 * За мышью — «течение» (маленькая симуляция 128×128: след скорости курсора, который сам себя переносит и затухает).
 * Заголовок рядом с курсором подменяется своей копией на WebGL-холсте: каждая точка берёт текст 18 раз
 * назад по течению и усредняет — буквы тянутся шлейфом вдоль движения; течение стихает — буквы собираются,
 * и через ~2 с настоящий текст возвращается на место. В покое — ни одного кадра.
 * Только для мыши; при «уменьшить движение» эффекта нет.
 */

const MIN_PX = 20; // «крупный» текст: заголовки, цитата, названия ароматов (подписи полок 19 px — нет)
const PAD = 70; // запас вокруг текста — куда шлейф может вытянуться, px
const QUIET = 2200; // мс без движения — эффект гаснет
const SIM = 128;

const fullVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// течение: переносит само себя (завихрения), затухает, у курсора получает «мазок» его скорости
const flowFrag = /* glsl */ `
precision highp float;
uniform sampler2D tPrev;
uniform vec2 uMouse;      // 0..1, y вверх
uniform vec2 uVel;        // скорость курсора, −1..1, y вверх
uniform float uAspect;
uniform float uDiss;
varying vec2 vUv;
void main(){
  vec2 v = texture2D(tPrev, vUv).xy;
  vec2 adv = texture2D(tPrev, vUv - v * 0.012).xy * uDiss;
  vec2 d = vUv - uMouse; d.x *= uAspect;
  float f = smoothstep(0.11, 0.0, length(d));
  adv = mix(adv, uVel, f * min(1.0, length(uVel) * 4.0));
  gl_FragColor = vec4(adv, 0.0, 1.0);
}`;

const quadVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// заголовок: усреднение вдоль течения — шлейф
const smearFrag = /* glsl */ `
precision highp float;
uniform sampler2D tText;
uniform sampler2D tFlow;
uniform vec2 uRes;    // холст, px
uniform vec2 uSize;   // этот прямоугольник, px
uniform float uAlpha;
varying vec2 vUv;
void main(){
  vec2 flow = texture2D(tFlow, gl_FragCoord.xy / uRes).xy;
  vec2 off = flow * 95.0 / uSize;
  // шаги со случайным сдвигом на пиксель — шлейф ровный, без отдельных «копий» букв
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 18; i++) {
    float t = (float(i) + j) / 18.0;
    acc += texture2D(tText, vUv - off * t);
  }
  acc /= 18.0;
  gl_FragColor = acc * uAlpha;
}`;

type Item = {
  el: HTMLElement;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  tex: THREE.CanvasTexture;
  color: string;
};

/** итоговая прозрачность элемента с учётом родителей (заголовок витрины гаснет при прокрутке) */
function opacityOf(el: HTMLElement) {
  let o = 1;
  for (let n: HTMLElement | null = el; n && o > 0.01; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.visibility === "hidden" || s.display === "none") return 0;
    o *= parseFloat(s.opacity || "1");
  }
  return o;
}

export function HeadingSmear() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    r.setPixelRatio(dpr);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;

    // течение — два буфера по очереди
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    let fa = new THREE.WebGLRenderTarget(SIM, SIM, opts);
    let fb = new THREE.WebGLRenderTarget(SIM, SIM, opts);
    const flowMat = new THREE.ShaderMaterial({
      uniforms: { tPrev: { value: fa.texture }, uMouse: { value: new THREE.Vector2(-1, -1) }, uVel: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uDiss: { value: 0.955 } },
      vertexShader: fullVert,
      fragmentShader: flowFrag,
    });
    const fullGeo = new THREE.PlaneGeometry(2, 2);
    const flowScene = new THREE.Scene();
    flowScene.add(new THREE.Mesh(fullGeo, flowMat));
    const cam2 = new THREE.Camera();

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
    const quadGeo = new THREE.PlaneGeometry(1, 1);
    const items = new Map<HTMLElement, Item>();

    let W = 0;
    let H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      r.setSize(W, H, false);
      cam.right = W;
      cam.bottom = -H;
      cam.updateProjectionMatrix();
      flowMat.uniforms.uAspect.value = W / H;
    };
    resize();
    window.addEventListener("resize", resize);

    // копия заголовка: каждая буква — на своём месте, тем же шрифтом и цветом
    const build = (el: HTMLElement, color: string): Item | null => {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return null;
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas");
      c.width = Math.ceil((box.width + PAD * 2) * dpr);
      c.height = Math.ceil((box.height + PAD * 2) * dpr);
      const x = c.getContext("2d")!;
      x.scale(dpr, dpr);
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      x.fillStyle = color;
      x.textBaseline = "alphabetic";
      const asc = x.measureText("Hg").fontBoundingBoxAscent;
      el.querySelectorAll<HTMLElement>("[data-ch]").forEach((s) => {
        const ch = s.textContent ?? "";
        if (!ch.trim()) return;
        const b = s.getBoundingClientRect();
        x.fillText(ch, b.left - box.left + PAD, b.top - box.top + PAD + asc);
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.premultiplyAlpha = true;
      const mat = new THREE.ShaderMaterial({
        uniforms: { tText: { value: tex }, tFlow: { value: fa.texture }, uRes: { value: new THREE.Vector2(W * dpr, H * dpr) }, uSize: { value: new THREE.Vector2() }, uAlpha: { value: 1 } },
        vertexShader: quadVert,
        fragmentShader: smearFrag,
        transparent: true,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(quadGeo, mat);
      scene.add(mesh);
      return { el, mesh, tex, color };
    };

    const drop = (it: Item) => {
      it.el.style.color = "";
      scene.remove(it.mesh);
      it.mesh.material.dispose();
      it.tex.dispose();
      items.delete(it.el);
    };
    const dropAll = () => items.forEach(drop);

    // заголовок проявился полностью и не закрыт окном аромата
    const ready = (el: HTMLElement) => {
      if (parseFloat(getComputedStyle(el).fontSize) < MIN_PX) return false;
      const chars = el.querySelectorAll<HTMLElement>("[data-ch]");
      const lastC = chars[chars.length - 1];
      if (!lastC || parseFloat(getComputedStyle(lastC).opacity) < 0.98) return false;
      if (opacityOf(el) < 0.98) return false;
      // открыто окно аромата поверх страницы — только заголовки внутри него
      const modal = document.querySelector('[aria-modal="true"]');
      return !modal || modal.contains(el);
    };

    const mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4 };
    let lastMove = 0;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const now = performance.now();
      if (now - lastMove > QUIET) {
        dropAll();
        r.clear();
        return;
      }
      // течение
      const vx = mouse.px > -1e3 ? (mouse.x - mouse.px) / 40 : 0;
      const vy = mouse.py > -1e3 ? (mouse.y - mouse.py) / 40 : 0;
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      flowMat.uniforms.tPrev.value = fa.texture;
      flowMat.uniforms.uMouse.value.set(mouse.x / W, 1 - mouse.y / H);
      flowMat.uniforms.uVel.value.set(Math.max(-1, Math.min(1, vx)), Math.max(-1, Math.min(1, -vy)));
      r.setRenderTarget(fb);
      r.render(flowScene, cam2);
      r.setRenderTarget(null);
      [fa, fb] = [fb, fa];

      // заголовки
      r.clear();
      items.forEach((it) => {
        const b = it.el.getBoundingClientRect();
        const w = b.width + PAD * 2;
        const h = b.height + PAD * 2;
        it.mesh.position.set(b.left - PAD + w / 2, -(b.top - PAD + h / 2), 0);
        it.mesh.scale.set(w, h, 1);
        const u = it.mesh.material.uniforms;
        u.tFlow.value = fa.texture;
        u.uSize.value.set(w, h);
        u.uRes.value.set(W * dpr, H * dpr);
        u.uAlpha.value = opacityOf(it.el);
      });
      r.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMove = performance.now();
      // заголовки рядом с курсором подменяем копией
      smearTargets.forEach((el) => {
        if (items.has(el)) return;
        const b = el.getBoundingClientRect();
        if (e.clientX < b.left - 140 || e.clientX > b.right + 140 || e.clientY < b.top - 140 || e.clientY > b.bottom + 140) return;
        if (!ready(el)) return;
        const color = getComputedStyle(el).color;
        const it = build(el, color);
        if (!it) return;
        items.set(el, it);
        el.style.color = "transparent";
      });
      if (!raf && items.size) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    // смена темы — цвет другой: вернуть настоящий текст, копии соберутся заново
    const offTheme = onTheme(dropAll);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      offTheme();
      dropAll();
      fa.dispose();
      fb.dispose();
      flowMat.dispose();
      fullGeo.dispose();
      quadGeo.dispose();
      r.dispose();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}

export default HeadingSmear;
