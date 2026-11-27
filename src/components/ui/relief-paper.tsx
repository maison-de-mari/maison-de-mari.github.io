"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Фон всего сайта — матовая бумага с гипсовым рельефом (розы, жасмин, ирис, листья, веточки).
 * В покое — ровная бумага, рельефа нет; там, где проходит курсор (или палец), он поднимается из бумаги
 * и медленно оседает обратно. Рельеф нарисован программно: фигуры → карта высот (размытие для объёма)
 * → шейдер освещает её сверху слева, как гипс.
 * Лёгкий: разрешение 1×, кадры рисуются только пока что-то меняется (мышь, прокрутка, размер окна).
 */

const TILE = 1024;

// ───────── карта высот рельефа (один раз, в браузере) ─────────
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function drawRelief(): Uint8Array {
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const x = c.getContext("2d")!;
  x.fillStyle = "#000";
  x.fillRect(0, 0, TILE, TILE);
  x.globalCompositeOperation = "lighter"; // наложения поднимаются выше — лепестки слоями
  const r = rng(7);

  const petal = (cx: number, cy: number, ang: number, len: number, wid: number, a: number) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(ang);
    x.fillStyle = `rgba(255,255,255,${a})`;
    x.beginPath();
    x.moveTo(0, 0);
    x.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.85, 0, -len);
    x.bezierCurveTo(-wid * 0.9, -len * 0.85, -wid, -len * 0.25, 0, 0);
    x.fill();
    x.restore();
  };
  const leaf = (cx: number, cy: number, ang: number, len: number, wid: number) => {
    petal(cx, cy, ang, len, wid, 0.32);
    petal(cx, cy, ang, len * 0.92, wid * 0.55, 0.14);
    // прожилка — бороздка
    x.save();
    x.globalCompositeOperation = "destination-out";
    x.translate(cx, cy);
    x.rotate(ang);
    x.strokeStyle = "rgba(0,0,0,0.25)";
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(0, -len * 0.08);
    x.quadraticCurveTo(wid * 0.12, -len * 0.5, 0, -len * 0.92);
    x.stroke();
    x.restore();
  };
  const stem = (pts: [number, number][], w: number) => {
    x.lineCap = "round";
    x.lineJoin = "round";
    for (let k = 0; k < 3; k++) {
      x.strokeStyle = `rgba(255,255,255,${0.16 + k * 0.06})`;
      x.lineWidth = w * (1 - k * 0.3);
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        x.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const l = pts[pts.length - 1];
      x.lineTo(l[0], l[1]);
      x.stroke();
    }
  };
  const stemsAndFlowers = (sx: number, sy: number, ang: number, len: number, g: () => number) => {
    const pts: [number, number][] = [];
    let a = ang;
    let px = sx;
    let py = sy;
    for (let i = 0; i <= 6; i++) {
      pts.push([px, py]);
      a += (g() - 0.5) * 0.5;
      px += Math.cos(a) * (len / 6);
      py += Math.sin(a) * (len / 6);
    }
    stem(pts, 7);
    for (let i = 1; i < pts.length - 1; i++) {
      const side = i % 2 ? 1 : -1;
      leaf(pts[i][0], pts[i][1], a + side * (1.0 + g() * 0.4) + Math.PI / 2, 46 + g() * 30, 17 + g() * 6);
    }
    const [ex, ey] = pts[pts.length - 1];
    const kind = g();
    if (kind < 0.4) rose(ex, ey, 52 + g() * 18, g);
    else if (kind < 0.7) iris(ex, ey, 62 + g() * 14, a + Math.PI / 2);
    else jasmine(ex, ey, 40 + g() * 10, g);
    const [mx, my] = pts[3];
    if (g() < 0.6) jasmine(mx + 26, my - 18, 22 + g() * 8, g);
    else berries(mx + 22, my + 14, 14, g);
  };
  const rose = (cx: number, cy: number, s: number, g: () => number) => {
    // внешние лепестки, потом спираль всё плотнее к центру
    for (let i = 0; i < 7; i++) petal(cx, cy, (i / 7) * Math.PI * 2 + g() * 0.3, s, s * 0.62, 0.2);
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const rad = s * 0.16 * (1 - t);
      const a = t * Math.PI * 5;
      petal(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, a + 1.4, s * (0.72 - t * 0.45), s * (0.5 - t * 0.28), 0.16);
    }
  };
  const jasmine = (cx: number, cy: number, s: number, g: () => number) => {
    const o = g() * Math.PI;
    for (let i = 0; i < 5; i++) petal(cx, cy, o + (i / 5) * Math.PI * 2, s, s * 0.42, 0.3);
    x.fillStyle = "rgba(255,255,255,0.35)";
    x.beginPath();
    x.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    x.fill();
  };
  const iris = (cx: number, cy: number, s: number, ang: number) => {
    for (let i = -1; i <= 1; i++) petal(cx, cy, ang + i * 0.5, s, s * 0.34, 0.28); // стоячие лепестки
    for (let i = -1; i <= 1; i += 2) petal(cx, cy, ang + Math.PI * 0.62 * i, s * 0.9, s * 0.4, 0.24); // свисающие
  };
  const berries = (cx: number, cy: number, s: number, g: () => number) => {
    for (let i = 0; i < 5; i++) {
      const a = g() * Math.PI * 2;
      const d = g() * s;
      x.fillStyle = "rgba(255,255,255,0.4)";
      x.beginPath();
      x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * 0.22, 0, Math.PI * 2);
      x.fill();
    }
  };

  // 9 веточек по тайлу; каждую рисуем и со сдвигом на тайл (своим генератором — копии одинаковые), стык бесшовный
  for (let gy = 0; gy < 3; gy++)
    for (let gx = 0; gx < 3; gx++) {
      const cx = (gx + 0.15 + r() * 0.7) * (TILE / 3);
      const cy = (gy + 0.15 + r() * 0.7) * (TILE / 3);
      const ang = r() * Math.PI * 2;
      const len = 170 + r() * 90;
      const seed = Math.floor(r() * 1e9);
      for (const ox of [-TILE, 0, TILE])
        for (const oy of [-TILE, 0, TILE]) {
          if (cx + ox < -320 || cx + ox > TILE + 320 || cy + oy < -320 || cy + oy > TILE + 320) continue;
          stemsAndFlowers(cx + ox, cy + oy, ang, len, rng(seed));
        }
    }

  // объём: смесь чёткой формы и размытой (три прохода бокс-размытия ≈ гаусс), по тайлу с переносом
  const src = x.getImageData(0, 0, TILE, TILE).data;
  const sharp = new Float32Array(TILE * TILE);
  for (let i = 0; i < sharp.length; i++) sharp[i] = Math.min(1, src[i * 4] / 255);
  const a = Float32Array.from(sharp);
  const b = new Float32Array(TILE * TILE);
  const R = 4;
  const norm = 1 / (2 * R + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < TILE; y++) {
      const row = y * TILE;
      let s = 0;
      for (let k = -R; k <= R; k++) s += a[row + ((k + TILE) % TILE)];
      for (let xx = 0; xx < TILE; xx++) {
        b[row + xx] = s * norm;
        s += a[row + ((xx + R + 1) % TILE)] - a[row + ((xx - R + TILE) % TILE)];
      }
    }
    for (let xx = 0; xx < TILE; xx++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += b[((k + TILE) % TILE) * TILE + xx];
      for (let y = 0; y < TILE; y++) {
        a[y * TILE + xx] = s * norm;
        s += b[((y + R + 1) % TILE) * TILE + xx] - b[((y - R + TILE) % TILE) * TILE + xx];
      }
    }
  }
  const out = new Uint8Array(TILE * TILE);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(1, a[i] * 0.75 + sharp[i] * 0.25) * 255);
  return out;
}

// ───────── шейдер ─────────
const vertexShader = /* glsl */ `
void main() { gl_Position = vec4(position, 1.0); }`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D hmap;
uniform sampler2D mask;
uniform vec2 res;
uniform float scroll;
uniform float base;
uniform float tile;
float H(vec2 p){ return texture2D(hmap, p).r; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc + vec2(0.0, scroll)) / tile;
  float m = texture2D(mask, fc / res).a;
  float k = mix(base, 1.0, smoothstep(0.0, 1.0, m));
  float e = 1.5 / 1024.0;
  float hx = H(uv + vec2(e, 0.0)) - H(uv - vec2(e, 0.0));
  float hy = H(uv + vec2(0.0, e)) - H(uv - vec2(0.0, e));
  vec3 n = normalize(vec3(-hx * 6.0 * k, -hy * 6.0 * k, 1.0));
  vec3 L = normalize(vec3(-0.55, 0.65, 0.75));
  float diff = dot(n, L) / L.z;            // ровная бумага = 1
  float h = H(uv);
  vec3 paper = vec3(0.945, 0.937, 0.918);
  vec3 col = paper * mix(1.0, diff, 0.9);
  col += vec3(0.02) * h * k;                // верхушки рельефа чуть светлее
  col -= 0.012 * (hash(floor(fc)) - 0.5);   // зерно бумаги
  gl_FragColor = vec4(col, 1.0);
}`;

export function ReliefPaper({ className = "", base = 0 }: { className?: string; base?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 1.2s ease";
    el.appendChild(renderer.domElement);

    // маска «поднятого» рельефа: мазки за курсором на маленьком холсте, гаснут со временем
    const MS = 6; // во сколько раз маска меньше экрана
    const mc = document.createElement("canvas");
    const mx = mc.getContext("2d")!;
    const maskTex = new THREE.CanvasTexture(mc);
    maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter;
    maskTex.generateMipmaps = false;

    const hTex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat);
    const uniforms = {
      hmap: { value: hTex as THREE.Texture },
      mask: { value: maskTex },
      res: { value: new THREE.Vector2(1, 1) },
      scroll: { value: 0 },
      base: { value: base },
      tile: { value: 900 },
    };
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(geometry, material));

    let ready = false;
    const draw = () => {
      if (!ready) return;
      uniforms.scroll.value = -window.scrollY * 0.5; // рельеф уезжает медленнее страницы — глубина
      maskTex.needsUpdate = true;
      renderer.render(scene, camera);
    };

    // карту высот строим в простое браузера, чтобы не мешать первой отрисовке страницы
    const build = () => {
      const data = drawRelief();
      const t = new THREE.DataTexture(data, TILE, TILE, THREE.RedFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      uniforms.hmap.value = t;
      ready = true;
      draw();
      renderer.domElement.style.opacity = "1";
    };
    const idle = "requestIdleCallback" in window;
    const idleId = idle ? window.requestIdleCallback(build, { timeout: 1500 }) : window.setTimeout(build, 300);

    // мазки
    let last: { x: number; y: number } | null = null;
    let lastMove = 0;
    let raf = 0;
    let prev = 0;
    const brush = (x: number, y: number) => {
      const r = Math.max(18, Math.min(mc.width, mc.height) * 0.2);
      const g = mx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.3)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      mx.fillStyle = g;
      mx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      // медленно оседает: за ~3–4 с
      mx.globalCompositeOperation = "destination-out";
      mx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.55)})`;
      mx.fillRect(0, 0, mc.width, mc.height);
      mx.globalCompositeOperation = "source-over";
      draw();
      if (now - lastMove < 4500) raf = requestAnimationFrame(tick);
      else {
        mx.clearRect(0, 0, mc.width, mc.height);
        draw();
        prev = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const move = (cx: number, cy: number) => {
      const p = { x: cx / MS, y: cy / MS };
      if (last) {
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        const steps = Math.min(12, Math.ceil(d / 3));
        for (let i = 1; i <= steps; i++) brush(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps);
      } else brush(p.x, p.y);
      last = p;
      lastMove = performance.now();
      kick();
    };
    const onPointer = (e: PointerEvent) => move(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => e.touches[0] && move(e.touches[0].clientX, e.touches[0].clientY);
    const onLeave = () => (last = null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("touchmove", onTouch, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    let sraf = 0;
    const onScroll = () => {
      if (raf || sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        draw();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      uniforms.res.value.set(renderer.domElement.width, renderer.domElement.height);
      mc.width = Math.max(1, Math.ceil(w / MS));
      mc.height = Math.max(1, Math.ceil(h / MS));
      maskTex.dispose(); // новый размер холста — пересоздать текстуру на GPU
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => {
      if (idle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sraf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchmove", onTouch);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      maskTex.dispose();
      uniforms.hmap.value.dispose();
    };
  }, [base]);

  return <div ref={ref} aria-hidden className={`overflow-hidden bg-[#f1efea] ${className}`} />;
}

export default ReliefPaper;
