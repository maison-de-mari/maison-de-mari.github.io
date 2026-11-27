"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Фон всего сайта — матовая бумага, под которой спрятана одна длинная гипсовая картина на всю высоту
 * страницы (без повторов): розы, пионы, жасмин и флёрдоранж, лаванда, ирис, листья, ленты с бантами,
 * бабочки и рассыпанные лепестки — романтичная парфюмерная флористика.
 * В покое — ровная бумага. Рельеф поднимается только вокруг курсора мыши; когда мышь замирает,
 * он ещё немного держится и медленно тает (~4 с). Проявленное место привязано к странице: прокрутка ничего не проявляет.
 * На сенсорных экранах мыши нет — картина не строится (только бумага), память и батарея не тратятся.
 * Кадры рисуются только пока мышь двигается и рельеф тает.
 */

// ───────── генератор ─────────
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** лепесток-капля: основание в (0,0), кончик вверх на len */
function petal(x: Ctx, cx: number, cy: number, ang: number, len: number, wid: number, a: number, round = 0.85) {
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  x.fillStyle = `rgba(255,255,255,${a})`;
  x.beginPath();
  x.moveTo(0, 0);
  x.bezierCurveTo(wid, -len * 0.2, wid * round, -len * 0.9, 0, -len);
  x.bezierCurveTo(-wid * round, -len * 0.9, -wid, -len * 0.2, 0, 0);
  x.fill();
  x.restore();
}

function groove(x: Ctx, draw: () => void, w: number, a = 0.3) {
  x.save();
  x.globalCompositeOperation = "destination-out";
  x.strokeStyle = `rgba(0,0,0,${a})`;
  x.lineWidth = w;
  x.lineCap = "round";
  draw();
  x.restore();
}

function leaf(x: Ctx, cx: number, cy: number, ang: number, len: number, wid: number) {
  petal(x, cx, cy, ang, len, wid, 0.3, 0.7);
  petal(x, cx, cy, ang, len * 0.9, wid * 0.5, 0.12, 0.7);
  groove(
    x,
    () => {
      x.translate(cx, cy);
      x.rotate(ang);
      x.beginPath();
      x.moveTo(0, -len * 0.06);
      x.quadraticCurveTo(wid * 0.1, -len * 0.5, 0, -len * 0.9);
      x.stroke();
      for (let i = 1; i <= 3; i++) {
        const y = -len * (0.2 + i * 0.17);
        for (const s of [-1, 1]) {
          x.beginPath();
          x.moveTo(0, y);
          x.lineTo(s * wid * 0.55, y - len * 0.1);
          x.stroke();
        }
      }
    },
    Math.max(1, len / 50),
    0.22,
  );
}

function stem(x: Ctx, pts: [number, number][], w: number) {
  x.lineCap = "round";
  x.lineJoin = "round";
  for (let k = 0; k < 3; k++) {
    x.strokeStyle = `rgba(255,255,255,${0.1 + k * 0.05})`;
    x.lineWidth = w * (1 - k * 0.32);
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) x.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const l = pts[pts.length - 1];
    x.lineTo(l[0], l[1]);
    x.stroke();
  }
}

/** изогнутая ветка: точки от начала, плавно поворачивая */
function path(sx: number, sy: number, ang: number, len: number, bend: number, g: () => number, n = 8): [number, number][] {
  const pts: [number, number][] = [];
  let a = ang;
  let px = sx;
  let py = sy;
  for (let i = 0; i <= n; i++) {
    pts.push([px, py]);
    a += bend / n + (g() - 0.5) * 0.25;
    px += Math.cos(a) * (len / n);
    py += Math.sin(a) * (len / n);
  }
  return pts;
}

function rose(x: Ctx, cx: number, cy: number, s: number, g: () => number) {
  // чашечка из крупных лепестков, затем спираль всё плотнее к центру
  for (let i = 0; i < 8; i++) petal(x, cx, cy, (i / 8) * Math.PI * 2 + g() * 0.3, s, s * 0.7, 0.17, 0.95);
  for (let i = 0; i < 6; i++) petal(x, cx, cy, (i / 6) * Math.PI * 2 + 0.4 + g() * 0.3, s * 0.78, s * 0.6, 0.14, 0.95);
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    const rad = s * 0.2 * (1 - t);
    const a = t * Math.PI * 6;
    petal(x, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, a + 1.5, s * (0.62 - t * 0.42), s * (0.46 - t * 0.28), 0.14, 0.95);
  }
  groove(
    x,
    () => {
      x.beginPath();
      for (let t = 0; t < Math.PI * 5; t += 0.2) {
        const r = s * 0.04 + (t / (Math.PI * 5)) * s * 0.34;
        const px = cx + Math.cos(t) * r;
        const py = cy + Math.sin(t) * r;
        if (t === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
    },
    Math.max(1, s / 28),
    0.25,
  );
}

function peony(x: Ctx, cx: number, cy: number, s: number, g: () => number) {
  // пышный: кольца округлых лепестков
  for (let ring = 0; ring < 4; ring++) {
    const n = 12 - ring * 2;
    const rr = s * (1 - ring * 0.22);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4 + g() * 0.2;
      petal(x, cx + Math.cos(a) * rr * 0.12, cy + Math.sin(a) * rr * 0.12, a + Math.PI / 2, rr * (0.8 + g() * 0.2), rr * 0.42, 0.11, 1);
    }
  }
  x.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 14; i++) {
    const a = g() * Math.PI * 2;
    const d = g() * s * 0.18;
    x.beginPath();
    x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * 0.05, 0, Math.PI * 2);
    x.fill();
  }
}

function blossom(x: Ctx, cx: number, cy: number, s: number, g: () => number) {
  // жасмин / флёрдоранж: пять лепестков звездой и тычинки
  const o = g() * Math.PI;
  for (let i = 0; i < 5; i++) petal(x, cx, cy, o + (i / 5) * Math.PI * 2, s, s * 0.44, 0.28, 0.9);
  x.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath();
    x.arc(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2, s * 0.06, 0, Math.PI * 2);
    x.fill();
  }
}

function bud(x: Ctx, cx: number, cy: number, ang: number, s: number) {
  petal(x, cx, cy, ang, s, s * 0.38, 0.32, 0.8);
  petal(x, cx, cy, ang - 0.5, s * 0.5, s * 0.22, 0.25);
  petal(x, cx, cy, ang + 0.5, s * 0.5, s * 0.22, 0.25);
}

function lavender(x: Ctx, sx: number, sy: number, ang: number, len: number, g: () => number) {
  const pts = path(sx, sy, ang, len, (g() - 0.5) * 0.4, g, 6);
  stem(x, pts, 3.5);
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 3];
  const a = Math.atan2(ey - py, ex - px);
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const bx = px + (ex - px) * t * 1.3;
    const by = py + (ey - py) * t * 1.3;
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(bx, by);
      x.rotate(a + sd * 0.7);
      x.fillStyle = "rgba(255,255,255,0.3)";
      x.beginPath();
      x.ellipse(5, 0, 5.5 * (1 - t * 0.4), 3.2 * (1 - t * 0.4), 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  }
}

function iris(x: Ctx, cx: number, cy: number, s: number, ang: number) {
  for (let i = -1; i <= 1; i++) petal(x, cx, cy, ang + i * 0.45, s, s * 0.34, 0.27);
  for (const i of [-1, 1]) petal(x, cx, cy, ang + Math.PI * 0.62 * i, s * 0.95, s * 0.42, 0.24);
  petal(x, cx, cy, ang + Math.PI, s * 0.7, s * 0.36, 0.2);
}

function butterfly(x: Ctx, cx: number, cy: number, s: number, ang: number) {
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  for (const sd of [-1, 1]) {
    petal(x, 0, 0, sd * 1.05, s, s * 0.75, 0.26, 1);
    petal(x, 0, 0, sd * 2.2, s * 0.7, s * 0.5, 0.24, 1);
  }
  x.fillStyle = "rgba(255,255,255,0.4)";
  x.beginPath();
  x.ellipse(0, 0, s * 0.07, s * 0.42, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "rgba(255,255,255,0.3)";
  x.lineWidth = 1.5;
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.moveTo(0, -s * 0.4);
    x.quadraticCurveTo(sd * s * 0.15, -s * 0.75, sd * s * 0.3, -s * 0.85);
    x.stroke();
  }
  x.restore();
}

/** лента: плавная волна полосой; на конце бант */
function ribbon(x: Ctx, sx: number, sy: number, len: number, ang: number, w: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const d = t * len;
    const off = Math.sin(t * Math.PI * 2.2) * len * 0.12;
    pts.push([sx + Math.cos(ang) * d - Math.sin(ang) * off, sy + Math.sin(ang) * d + Math.cos(ang) * off]);
  }
  x.lineCap = "round";
  x.lineJoin = "round";
  x.strokeStyle = "rgba(255,255,255,0.26)";
  x.lineWidth = w;
  x.beginPath();
  pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.stroke();
  x.strokeStyle = "rgba(255,255,255,0.12)";
  x.lineWidth = w * 0.5;
  x.stroke();
  const [bx, by] = pts[0];
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(bx, by);
    x.rotate(sd * 1.3 + ang);
    x.strokeStyle = "rgba(255,255,255,0.28)";
    x.lineWidth = w * 0.8;
    x.beginPath();
    x.ellipse(0, -w * 1.6, w * 0.9, w * 1.6, 0, 0, Math.PI * 2);
    x.stroke();
    x.restore();
    x.strokeStyle = "rgba(255,255,255,0.24)";
    x.lineWidth = w * 0.8;
    x.beginPath();
    x.moveTo(bx, by);
    x.quadraticCurveTo(bx + sd * w * 2, by + w * 3, bx + sd * w * 1.4, by + w * 6);
    x.stroke();
  }
  x.fillStyle = "rgba(255,255,255,0.35)";
  x.beginPath();
  x.arc(bx, by, w * 0.7, 0, Math.PI * 2);
  x.fill();
}

/** букет: ветки с листьями, главный цветок, бутоны, веточки жасмина, лаванда */
function bouquet(x: Ctx, cx: number, cy: number, s: number, dir: number, g: () => number) {
  const stems = 3 + Math.floor(g() * 2);
  for (let k = 0; k < stems; k++) {
    const ang = dir + (k - (stems - 1) / 2) * 0.42 + (g() - 0.5) * 0.2;
    const len = s * (1.1 + g() * 0.7);
    const pts = path(cx, cy, ang, len, (g() - 0.5) * 0.9, g);
    stem(x, pts, Math.max(4, s / 26));
    for (let i = 2; i < pts.length - 1; i += 2) {
      const sd = i % 4 ? 1 : -1;
      const la = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) + Math.PI / 2 + sd * (0.9 + g() * 0.4);
      leaf(x, pts[i][0], pts[i][1], la, s * (0.36 + g() * 0.18), s * 0.14);
    }
    const [ex, ey] = pts[pts.length - 1];
    const kind = g();
    const fs = s * (0.42 + g() * 0.2);
    if (kind < 0.38) rose(x, ex, ey, fs, g);
    else if (kind < 0.62) peony(x, ex, ey, fs * 1.1, g);
    else if (kind < 0.8) iris(x, ex, ey, fs, ang + Math.PI / 2);
    else for (let j = 0; j < 4; j++) blossom(x, ex + (g() - 0.5) * fs * 1.6, ey + (g() - 0.5) * fs * 1.6, fs * 0.42, g);
    const [mx, my] = pts[Math.floor(pts.length / 2)];
    if (g() < 0.5) bud(x, mx + s * 0.18, my - s * 0.1, ang + Math.PI / 2 - 0.4, s * 0.22);
  }
  if (g() < 0.6) lavender(x, cx, cy, dir + (g() < 0.5 ? -0.75 : 0.75), s * 1.4, g);
}

/** вся картина: ширина W, высота H (в пикселях картины) */
function drawScene(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#000";
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = "lighter"; // наложения поднимаются выше — лепестки слоями
  const g = rng(20251127);
  const S = Math.min(W, 1400) / 1400; // масштаб элементов от ширины
  const step = 520 * S + 180;

  // по краям — букеты, чередуясь слева и справа, ветки тянутся к центру
  let side = g() < 0.5 ? -1 : 1;
  for (let y = 120; y < H + 200; y += step * (0.75 + g() * 0.5)) {
    const xs = side < 0 ? W * (0.02 + g() * 0.1) : W * (0.88 + g() * 0.1);
    const dir = side < 0 ? -Math.PI / 2 + 0.75 + g() * 0.4 : -Math.PI / 2 - 0.75 - g() * 0.4;
    bouquet(x, xs, y + 160 * S, 230 * S, dir, g);
    // напротив — веточка поменьше или лента с бантом
    const xo = side < 0 ? W * (0.8 + g() * 0.15) : W * (0.05 + g() * 0.15);
    if (g() < 0.45) ribbon(x, xo, y + step * 0.45, 380 * S, side < 0 ? Math.PI * 0.75 : Math.PI * 0.25, 15 * S);
    else bouquet(x, xo, y + step * 0.5, 150 * S, side < 0 ? -Math.PI / 2 - 0.6 : -Math.PI / 2 + 0.6, g);
    side = -side;
  }
  // бабочки и россыпь лепестков по всей картине
  for (let i = 0; i < H / 700; i++) butterfly(x, W * (0.1 + g() * 0.8), g() * H, (34 + g() * 18) * S, (g() - 0.5) * 0.8);
  for (let i = 0; i < (W * H) / 26000; i++) {
    const px = g() * W;
    const py = g() * H;
    if (g() < 0.75) petal(x, px, py, g() * Math.PI * 2, (16 + g() * 14) * S, (10 + g() * 6) * S, 0.22, 1);
    else blossom(x, px, py, (12 + g() * 8) * S, g);
  }
  return c;
}

/** объём: смесь чёткой формы и размытой (3 прохода бокс-размытия ≈ гаусс) */
function toHeight(c: HTMLCanvasElement): Uint8Array {
  const W = c.width;
  const H = c.height;
  const src = c.getContext("2d")!.getImageData(0, 0, W, H).data;
  const sharp = new Float32Array(W * H);
  for (let i = 0; i < sharp.length; i++) sharp[i] = Math.min(1, src[i * 4] / 255);
  const a = Float32Array.from(sharp);
  const b = new Float32Array(W * H);
  const R = 4;
  const norm = 1 / (2 * R + 1);
  const cl = (v: number, m: number) => (v < 0 ? 0 : v >= m ? m - 1 : v);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let s = 0;
      for (let k = -R; k <= R; k++) s += a[row + cl(k, W)];
      for (let xx = 0; xx < W; xx++) {
        b[row + xx] = s * norm;
        s += a[row + cl(xx + R + 1, W)] - a[row + cl(xx - R, W)];
      }
    }
    for (let xx = 0; xx < W; xx++) {
      let s = 0;
      for (let k = -R; k <= R; k++) s += b[cl(k, H) * W + xx];
      for (let y = 0; y < H; y++) {
        a[y * W + xx] = s * norm;
        s += b[cl(y + R + 1, H) * W + xx] - b[cl(y - R, H) * W + xx];
      }
    }
  }
  const out = new Uint8Array(W * H);
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
uniform vec2 res;      // экран, px
uniform vec2 page;     // ширина и высота страницы, px
uniform vec2 texel;    // шаг по картине в uv
uniform float scroll;  // прокрутка, px
uniform float fade;    // общее «таяние» после остановки мыши (1 → 0)
float H(vec2 p){ return texture2D(hmap, p).r; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  // точка на странице (сверху вниз) → uv картины и маски
  vec2 uv = vec2(fc.x / page.x, (scroll + res.y - fc.y) / page.y);
  float k = smoothstep(0.0, 1.0, texture2D(mask, uv).a) * fade;
  vec3 paper = vec3(0.945, 0.937, 0.918);
  vec3 col = paper;
  if (k > 0.002) {
    float hx = H(uv + vec2(texel.x, 0.0)) - H(uv - vec2(texel.x, 0.0));
    float hy = H(uv - vec2(0.0, texel.y)) - H(uv + vec2(0.0, texel.y)); // ось картины — вниз
    vec3 n = normalize(vec3(-hx * 6.0 * k, -hy * 6.0 * k, 1.0));
    vec3 L = normalize(vec3(-0.55, 0.65, 0.75));
    col = paper * mix(1.0, dot(n, L) / L.z, 0.9) + vec3(0.02) * H(uv) * k;
  }
  col -= 0.012 * (hash(floor(fc)) - 0.5); // зерно бумаги
  gl_FragColor = vec4(col, 1.0);
}`;

const PAPER = "#f1efea";
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
    const maxTex = Math.min(8192, renderer.capabilities.maxTextureSize);

    // маска поднятого рельефа — на всю страницу, в 6 раз мельче
    const MS = 6;
    const mc = document.createElement("canvas");
    const mx = mc.getContext("2d")!;
    let maskTex = new THREE.CanvasTexture(mc);

    const uniforms = {
      hmap: { value: null as THREE.Texture | null },
      mask: { value: maskTex as THREE.Texture },
      res: { value: new THREE.Vector2(1, 1) },
      page: { value: new THREE.Vector2(1, 1) },
      texel: { value: new THREE.Vector2(1, 1) },
      scroll: { value: 0 },
      fade: { value: 1 },
    };
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
    scene.add(new THREE.Mesh(geometry, material));

    const draw = () => {
      if (!uniforms.hmap.value) return;
      uniforms.scroll.value = window.scrollY;
      maskTex.needsUpdate = true;
      renderer.render(scene, camera);
    };

    // картина под размер страницы; строим в простое браузера, перестраиваем при заметной смене размера
    let built = { w: 0, h: 0 };
    let buildId: number = 0;
    const build = () => {
      const pw = document.documentElement.clientWidth;
      const ph = document.documentElement.scrollHeight;
      if (Math.abs(pw - built.w) < 2 && Math.abs(ph - built.h) < ph * 0.08) return;
      built = { w: pw, h: ph };
      const s = Math.max(pw / 1400, ph / maxTex, 1); // css px на пиксель картины
      const W = Math.round(pw / s);
      const H = Math.round(ph / s);
      const t = new THREE.DataTexture(toHeight(drawScene(W, H)), W, H, THREE.RedFormat);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      uniforms.hmap.value?.dispose();
      uniforms.hmap.value = t;
      uniforms.texel.value.set(1.5 / W, 1.5 / H);
      uniforms.page.value.set(pw, ph);
      mc.width = Math.ceil(pw / MS);
      mc.height = Math.ceil(ph / MS);
      maskTex.dispose();
      maskTex = new THREE.CanvasTexture(mc);
      maskTex.flipY = false; // строки сверху вниз — как у картины и в шейдере
      maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter;
      maskTex.generateMipmaps = false;
      uniforms.mask.value = maskTex;
      draw();
    };
    const schedule = () => {
      if (buildId) return;
      const run = () => {
        buildId = 0;
        build();
      };
      buildId = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 400);
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
      if (e.pointerType !== "mouse") return;
      // браузер шлёт «движение» и при прокрутке колесом — курсор на месте, такие пропускаем
      if (e.clientX === lastClient.x && e.clientY === lastClient.y) return;
      lastClient = { x: e.clientX, y: e.clientY };
      if (!uniforms.hmap.value) return;
      // если рельеф уже таял — подхватываем: оставшееся видно как есть, след продолжается
      if (uniforms.fade.value < 1) {
        mx.globalCompositeOperation = "destination-out";
        mx.fillStyle = `rgba(0,0,0,${1 - uniforms.fade.value})`;
        mx.fillRect(0, 0, mc.width, mc.height);
        mx.globalCompositeOperation = "source-over";
        uniforms.fade.value = 1;
      }
      const p = { x: e.clientX / MS, y: (e.clientY + window.scrollY) / MS };
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

    // прокрутка: только перерисовать (картина едет со страницей), ничего не проявляя
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
      schedule();
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ro.observe(document.body); // высота страницы меняется — картину под неё
    resize();

    return () => {
      if (buildId) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(buildId);
        window.clearTimeout(buildId);
      }
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sraf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      maskTex.dispose();
      uniforms.hmap.value?.dispose();
    };
  }, []);

  return <div ref={ref} aria-hidden className={`overflow-hidden ${className}`} style={{ background: PAPER }} />;
}

export default ReliefPaper;
