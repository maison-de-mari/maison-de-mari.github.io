"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { smearTargets, onSmearTargets } from "@/lib/smear";
import { onTheme } from "@/lib/theme";

/**
 * Крупные заголовки, как на immersive-g.com (один прозрачный WebGL-холст поверх страницы):
 *
 * 1) Появление «чернилами» (заголовки с data-ink, ~4 с): буквы рождаются тонкими, как волосок, и набухают
 *    до полной толщины — волна идёт от левого края с рваной шумовой границей; одновременно прозрачность
 *    проявляется кругом от левого верхнего угла, а маска открывает текст снизу с неровным краем.
 *    Толщина — через «расстояние до буквы»: размытая копия текста, по которой режем порог.
 *    В конце — точная копия, и настоящий текст возвращается на место.
 * 2) Курсор размазывает текст: за мышью — «течение» (симуляция 128×128), каждая точка заголовка берёт текст
 *    18 раз назад по течению и усредняет — буквы тянутся шлейфом и собираются, когда течение стихает.
 *
 * Пока ничего не появляется и мышь не движется у заголовков — ни одного кадра. При «уменьшить движение» — выключено.
 */

const MIN_PX = 20; // «крупный» текст
const PAD = 70; // запас вокруг текста — куда шлейф может вытянуться, px
const QUIET = 2200; // мс без движения — размазывание гаснет
const SIM = 128;
const REVEAL = 4; // с — появление, как у них

const fullVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const flowFrag = /* glsl */ `
precision highp float;
uniform sampler2D tPrev;
uniform vec2 uMouse;
uniform vec2 uVel;
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

const textFrag = /* glsl */ `
precision highp float;
uniform sampler2D tText;   // точная копия (белым)
uniform sampler2D tDist;   // размытая копия: 0.5 ≈ край буквы, больше — глубже внутри
uniform sampler2D tFlow;
uniform vec2 uRes;
uniform vec2 uSize;        // прямоугольник с запасом, px
uniform vec2 uBox;         // сам текст, px
uniform float uPad;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uMode;       // 0 — размазывание, 1 — появление
uniform vec3 uProg;        // толщина, прозрачность, маска: 0..1
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 3.1) * 0.15; }
float remap(float v, float a, float b, float c, float d){ return c + (d - c) * ((v - a) / (b - a)); }

void main(){
  if (uMode < 0.5) {
    vec2 flow = texture2D(tFlow, gl_FragCoord.xy / uRes).xy;
    vec2 off = flow * 95.0 / uSize;
    float j = hash(gl_FragCoord.xy);
    float acc = 0.0;
    for (int i = 0; i < 18; i++) {
      float t = (float(i) + j) / 18.0;
      acc += texture2D(tText, vUv - off * t).a;
    }
    float a = acc / 18.0 * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
    return;
  }
  // координаты в самом тексте (как layoutUv у них), выровненные по квадрату
  vec2 lp = (vUv * uSize - uPad) / uBox;
  vec2 sq = (lp - 0.5) * vec2(1.0, uBox.y / uBox.x) + 0.5;
  vec2 nq = sq * 2.6 + uSeed;
  float n1 = fbm(nq), n2 = fbm(nq + 11.7), n3 = fbm(nq + 23.1);

  float ts = length(sq - vec2(0.0, 0.47)) + (n1 - 0.5) * 1.6;
  float tt = remap(uProg.x, 0.0, 1.0, -1.0, 4.0);
  float thick = 1.0 - smoothstep(tt - 1.0, tt, ts); // smoothstep с перевёрнутыми границами в GLSL не определён

  float fs = length(sq - vec2(0.0, 0.75)) + (n2 - 0.5) * 1.1;
  float ft = remap(uProg.y, 0.0, 1.0, -0.25, 2.3);
  float fade = 1.0 - smoothstep(ft - 1.0, ft, fs);

  float ms = length(sq - vec2(0.40, 0.0)) + (n3 - 0.5) * 1.1;
  float mt = remap(uProg.z, 0.0, 1.0, -0.25, 2.3);
  float mask = step(ms, mt);

  // тонкие буквы → полная толщина: порог по «расстоянию» опускается к краю
  // размытая копия: в сердцевине толстых штрихов ~0.5, у края ~0.1 — порог 0.42 оставляет тонкие сердцевины,
  // 0.27 — примерно обычная толщина; ближе к концу плавно переходим на точную копию
  float sig = texture2D(tDist, vUv).a - mix(0.44, 0.27, thick);
  float edge = clamp(sig / max(fwidth(sig), 1e-4) + 0.5, 0.0, 1.0);
  // набухли полностью — переходим на точную копию (у размытой тонкие засечки пропадают)
  float sharp = texture2D(tText, vUv).a;
  float a = mix(edge, sharp, smoothstep(0.55, 1.0, thick)) * fade * mask * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** cubic-bezier, как в CSS: прогресс времени → прогресс анимации */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const fx = ((ax * t + bx) * t + cx) * t - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= fx / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
// кривые — из их настроек заголовка
const E_THICK = bezier(0, 0.016, 0.5775, 0.972);
const E_FADE = bezier(0, 0.208, 0.3338, 0.968);
const E_MASK = bezier(0, 0.316, 0.4063, 0.959);

type Item = {
  el: HTMLElement;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  texs: THREE.Texture[];
  mode: "smear" | "reveal";
  t0: number;
  /** длительность появления, с */
  dur: number;
};

function opacityOf(el: HTMLElement) {
  let o = 1;
  for (let n: HTMLElement | null = el; n && o > 0.01; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.visibility === "hidden" || s.display === "none") return 0;
    o *= parseFloat(s.opacity || "1");
  }
  return o;
}

const toRGB = (css: string) => {
  const m = css.match(/[\d.]+/g) ?? ["0", "0", "0"];
  return new THREE.Vector3(+m[0] / 255, +m[1] / 255, +m[2] / 255);
};

export function HeadingSmear() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mouseOk = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    r.setPixelRatio(dpr);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;

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

    /** копия заголовка: каждая буква на своём месте, тем же шрифтом; blur > 0 — размытая («расстояние») */
    const paint = (el: HTMLElement, box: DOMRect, blur: number) => {
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas");
      c.width = Math.ceil((box.width + PAD * 2) * dpr);
      c.height = Math.ceil((box.height + PAD * 2) * dpr);
      const x = c.getContext("2d")!;
      x.scale(dpr, dpr);
      if (blur) x.filter = `blur(${blur}px)`;
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      x.fillStyle = "#fff";
      x.textBaseline = "alphabetic";
      const asc = x.measureText("Hg").fontBoundingBoxAscent;
      el.querySelectorAll<HTMLElement>("[data-ch]").forEach((s) => {
        const ch = s.textContent ?? "";
        if (!ch.trim()) return;
        const b = s.getBoundingClientRect();
        if (b.right > box.right + 1) return; // спрятано многоточием
        x.fillText(ch, b.left - box.left + PAD, b.top - box.top + PAD + asc);
      });
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };

    const build = (el: HTMLElement, color: string, mode: Item["mode"], delay = 0, dur = REVEAL): Item | null => {
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return null;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const sharp = paint(el, box, 0);
      const dist = mode === "reveal" ? paint(el, box, Math.max(1.2, fs * 0.045)) : sharp;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          tText: { value: sharp },
          tDist: { value: dist },
          tFlow: { value: fa.texture },
          uRes: { value: new THREE.Vector2(W * dpr, H * dpr) },
          uSize: { value: new THREE.Vector2(1, 1) },
          uBox: { value: new THREE.Vector2(box.width, box.height) },
          uPad: { value: PAD },
          uColor: { value: toRGB(color) },
          uAlpha: { value: 1 },
          uMode: { value: mode === "reveal" ? 1 : 0 },
          uProg: { value: new THREE.Vector3() },
          uSeed: { value: Math.random() * 50 },
        },
        vertexShader: quadVert,
        fragmentShader: textFrag,
        transparent: true,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(quadGeo, mat);
      scene.add(mesh);
      return { el, mesh, texs: dist === sharp ? [sharp] : [sharp, dist], mode, t0: performance.now() + delay * 1000, dur };
    };

    const drop = (it: Item) => {
      it.el.style.color = "";
      scene.remove(it.mesh);
      it.mesh.material.dispose();
      it.texs.forEach((t) => t.dispose());
      items.delete(it.el);
    };
    const dropSmears = () => items.forEach((it) => it.mode === "smear" && drop(it));

    const mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4 };
    let lastMove = 0;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const now = performance.now();
      if (now - lastMove > QUIET) dropSmears();
      let smearing = false;
      items.forEach((it) => {
        // заголовок убрали со страницы (сменился аромат) — копию тоже
        if (!it.el.isConnected) drop(it);
        else if (it.mode === "smear") smearing = true;
        else if (now - it.t0 > it.dur * 1000) drop(it); // появился — настоящий текст на место
      });
      if (!items.size) {
        r.clear();
        return;
      }
      if (smearing) {
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
      }
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
        if (it.mode === "reveal") {
          const p = Math.max(0, (now - it.t0) / (it.dur * 1000));
          u.uProg.value.set(E_THICK(p), E_FADE(p), E_MASK(p));
        }
      });
      r.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // ── появление: заголовок с data-ink попал на экран (наполовину) — играем «чернила»
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          if (parseFloat(getComputedStyle(el).fontSize) < MIN_PX) return; // мелкий — своё появление по буквам
          const color = getComputedStyle(el).color;
          el.style.color = "transparent";
          const delay = parseFloat(el.dataset.inkDelay ?? "0") || 0;
          const dur = parseFloat(el.dataset.inkTime ?? "") || REVEAL;
          fontsReady.then(() => {
            const old = items.get(el);
            if (old) drop(old);
            const it = build(el, color, "reveal", delay, dur);
            if (!it) {
              el.style.color = "";
              return;
            }
            el.style.color = "transparent";
            items.set(el, it);
            wake();
          });
        });
      },
      { threshold: 0.5 },
    );
    const seen = new WeakSet<HTMLElement>();
    const watch = () =>
      smearTargets.forEach((el) => {
        if (el.dataset.ink === undefined || seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    watch();
    const offTargets = onSmearTargets(watch);

    // ── размазывание курсором
    const ready = (el: HTMLElement) => {
      if (parseFloat(getComputedStyle(el).fontSize) < MIN_PX) return false;
      const chars = el.querySelectorAll<HTMLElement>("[data-ch]");
      const lastC = chars[chars.length - 1];
      if (!lastC || parseFloat(getComputedStyle(lastC).opacity) < 0.98) return false;
      if (opacityOf(el) < 0.98) return false;
      const modal = document.querySelector('[aria-modal="true"]');
      return !modal || modal.contains(el);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMove = performance.now();
      smearTargets.forEach((el) => {
        if (items.has(el)) return;
        const b = el.getBoundingClientRect();
        if (e.clientX < b.left - 140 || e.clientX > b.right + 140 || e.clientY < b.top - 140 || e.clientY > b.bottom + 140) return;
        if (!ready(el)) return;
        const it = build(el, getComputedStyle(el).color, "smear");
        if (!it) return;
        items.set(el, it);
        el.style.color = "transparent";
      });
      wake();
    };
    if (mouseOk) window.addEventListener("pointermove", onMove, { passive: true });
    // смена темы — другой цвет: размазанные вернуть, у появляющихся обновить цвет
    const offTheme = onTheme(() => {
      dropSmears();
      items.forEach((it) => {
        it.el.style.color = "";
        it.mesh.material.uniforms.uColor.value = toRGB(getComputedStyle(it.el).color);
        it.el.style.color = "transparent";
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      offTargets();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      offTheme();
      items.forEach(drop);
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
