import * as THREE from "three";

/**
 * Объёмный флакон из фотографий — лёгкий, без 3D-моделей.
 * По силуэту фото анфас строится фигура: круглый флакон — тело вращения, плоский — «выдавленный» силуэт
 * со скруглёнными рёбрами. На каждую сторону ложится своё фото: спереди — анфас, сзади — вид сзади,
 * на боковых гранях плоского — вид сбоку (толщина флакона берётся по нему же). Верх, низ и переходы —
 * цвет флакона на этой высоте со светом и бликом. Шейдер простой (без PBR и преломления) — быстро.
 *
 * Стекло и парфюм внутри: по карте материалов (R — стекло) оболочка там, где стекло, полупрозрачна —
 * с бликами и светлой толстой кромкой; внутри — объём жидкости её настоящего цвета (с фото), ниже
 * горлышка, над толстым стеклянным дном. Оболочка рисуется в два прохода (дальняя стенка, потом ближняя),
 * поэтому сквозь стекло видны и жидкость, и задняя стенка с этикеткой.
 */
export type SolidSpec = {
  kind: "round" | "flat";
  /** толщина плоского флакона в долях ширины — если нет фото сбоку */
  depth?: number;
  /** фото сзади и сбоку (без фона, обрезаны по флакону) */
  back?: string;
  side?: string;
  /** карта материалов того же кадра, что фото анфас: R — стекло */
  mask?: string;
};

export type SolidViews = { back?: THREE.Texture; side?: THREE.Texture; mask?: THREE.Texture };

const ROWS = 140; // сколько срезов по высоте берём из силуэта

/** Левый и правый край силуэта на каждой высоте (доли ширины фото), сверху вниз; плюс полоска цвета края */
function readSilhouette(img: HTMLImageElement) {
  const W = 256;
  const Hh = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hh;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, Hh);
  const d = g.getImageData(0, 0, W, Hh).data;
  const rows: { y: number; l: number; r: number }[] = [];
  for (let k = 0; k <= ROWS; k++) {
    const y = Math.min(Hh - 1, Math.round((k / ROWS) * (Hh - 1)));
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 128) {
        if (l < 0) l = x;
        r = x;
      }
    if (l >= 0) rows.push({ y: k / ROWS, l: l / W, r: (r + 1) / W });
  }

  // цвет края на каждой высоте: две средние по яркости точки из четырёх у краёв (без бликов), сглажено по высоте
  const SH = 256;
  const col = new Float32Array(SH * 3);
  const ok = new Uint8Array(SH);
  for (let k = 0; k < SH; k++) {
    const y = Math.min(Hh - 1, Math.round(((SH - 1 - k) / (SH - 1)) * (Hh - 1))); // k=0 — низ
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 150) {
        if (l < 0) l = x;
        r = x;
      }
    if (l < 0) continue;
    const inset = Math.max(2, Math.round((r - l) * 0.06));
    const xs = [l + inset, l + inset * 2, r - inset, r - inset * 2].map((x) => Math.min(r, Math.max(l, x)));
    const px = xs
      .map((x) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2]])
      .sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    for (let ch = 0; ch < 3; ch++) col[k * 3 + ch] = (px[1][ch] + px[2][ch]) / 2;
    ok[k] = 1;
  }
  const strip = new Uint8Array(SH * 4);
  const RAD = 6;
  for (let k = 0; k < SH; k++) {
    // строки без флакона берут цвет ближайшей строки с флаконом — чтобы на скруглениях не было чёрной кромки
    let w = 0;
    const acc = [0, 0, 0];
    for (let j = -RAD * 3; j <= RAD * 3; j++) {
      const kk = k + j;
      if (kk < 0 || kk >= SH || !ok[kk]) continue;
      const g2 = Math.exp(-(j * j) / (2 * RAD * RAD));
      for (let ch = 0; ch < 3; ch++) acc[ch] += col[kk * 3 + ch] * g2;
      w += g2;
    }
    for (let ch = 0; ch < 3; ch++) strip[k * 4 + ch] = w ? Math.round(acc[ch] / w) : 0;
    strip[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(strip, 1, SH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { rows, strip: tex };
}

/**
 * По фото и карте материалов: на каждой высоте — цвет жидкости (стеклянные пиксели фото, без бликов и букв),
 * доля стекла у края (для боков) и где по высоте стоит жидкость (самая длинная «стеклянная» полоса корпуса:
 * сверху — воздух под горлышком, снизу — толстое дно).
 */
function readLiquid(img: HTMLImageElement, maskImg: HTMLImageElement) {
  const W = 96;
  const Hh = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const read = (im: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = Hh;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(im, 0, 0, W, Hh);
    return g.getImageData(0, 0, W, Hh).data;
  };
  const d = read(img);
  const m = read(maskImg);
  const frac = new Float32Array(Hh);
  const edgeGlass = new Float32Array(Hh);
  const col = new Float32Array(Hh * 3);
  for (let y = 0; y < Hh; y++) {
    const px: number[][] = [];
    let l = -1;
    let r = -1;
    let solid = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 200) continue;
      solid++;
      if (l < 0) l = x;
      r = x;
      if (m[i] > 90) px.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (!solid) continue;
    frac[y] = px.length / solid;
    const inset = Math.max(1, Math.round((r - l) * 0.08));
    edgeGlass[y] = (m[(y * W + Math.min(r, l + inset)) * 4] + m[(y * W + Math.max(l, r - inset)) * 4]) / 510;
    if (px.length < 3) continue;
    px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    // средняя треть по яркости — без бликов и тёмных букв
    const lo = Math.floor(px.length / 3);
    const hi = Math.max(lo + 1, Math.ceil((px.length * 2) / 3));
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let k = lo; k < hi; k++) sum += px[k][ch];
      col[y * 3 + ch] = sum / (hi - lo);
    }
  }
  // самая длинная полоса, где стекла много, — корпус с жидкостью
  let best = [0, -1];
  let start = -1;
  for (let y = 0; y <= Hh; y++) {
    const on = y < Hh && frac[y] > 0.3;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - 1 - start > best[1] - best[0]) best = [start, y - 1];
      start = -1;
    }
  }
  const has = best[1] - best[0] > Hh * 0.15;
  // уровень жидкости: чуть ниже верха полосы (воздух), дно — толстое стекло
  const top = best[0] + Hh * 0.035;
  const bottom = best[1] - Hh * 0.05;

  // полоски по высоте (низ — первая строка): rgb — цвет жидкости, a — есть ли жидкость; вторая: r — стекло у края
  const SH = 256;
  const liq = new Uint8Array(SH * 4);
  const gl = new Uint8Array(SH * 4);
  const RAD = 3;
  for (let k = 0; k < SH; k++) {
    const yf = (1 - k / (SH - 1)) * (Hh - 1); // строка фото (сверху вниз)
    const y = Math.round(yf);
    let w = 0;
    const acc = [0, 0, 0];
    for (let j = -RAD * 3; j <= RAD * 3; j++) {
      const yy = y + j;
      if (yy < best[0] || yy > best[1] || frac[yy] < 0.3) continue;
      const g2 = Math.exp(-(j * j) / (2 * RAD * RAD));
      for (let ch = 0; ch < 3; ch++) acc[ch] += col[yy * 3 + ch] * g2;
      w += g2;
    }
    for (let ch = 0; ch < 3; ch++) liq[k * 4 + ch] = w ? Math.round(acc[ch] / w) : 0;
    liq[k * 4 + 3] = has && yf >= top && yf <= bottom && w ? 255 : 0;
    gl[k * 4] = Math.round((edgeGlass[y] ?? 0) * 255);
    gl[k * 4 + 3] = 255;
  }
  const tex = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, 1, SH, THREE.RGBAFormat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { has, liquid: tex(liq, true), glass: tex(gl, false), top: 1 - top / Hh, bottom: 1 - bottom / Hh };
}

const vert = /* glsl */ `
varying vec3 vPos;
varying vec3 vN;
varying vec3 vViewN;
varying vec3 vViewPos;
void main(){
  vPos = position;
  vN = normal;
  vViewN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform sampler2D backMap;
uniform sampler2D sideMap;
uniform sampler2D strip;
uniform float uHasBack;
uniform float uHasSide;
uniform vec4 uBox;     // x0, y0, ширина, высота фото в координатах флакона
uniform float uDepth;  // толщина плоского флакона
uniform float uDim;
uniform float uFlat;   // 1 — плоский флакон, 0 — круглый
uniform sampler2D maskMap;
uniform sampler2D glassStrip;
uniform float uHasMask;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vViewN;
varying vec3 vViewPos;

// фото со стороны; где на нём нет флакона (прозрачно) — цвет флакона на этой высоте
vec3 viewOr(sampler2D t, vec2 uv, vec3 fallback, float has, out float a) {
  vec4 c = texture2D(t, uv);
  a = c.a * has;
  return mix(fallback, c.rgb, a);
}

void main(){
  vec2 uv = clamp(vec2((vPos.x - uBox.x) / uBox.z, (vPos.y - uBox.y) / uBox.w), 0.0, 1.0);
  vec3 n = normalize(vN);
  vec3 vn = normalize(vViewN);
  vec3 v = normalize(-vViewPos);
  if (!gl_FrontFacing) vn = -vn;

  vec3 side = texture2D(strip, vec2(0.5, uv.y)).rgb;

  // какая сторона: перёд, спина, правый/левый бок
  float wF, wB, wS;
  if (uFlat > 0.5) {
    // передняя грань слегка изогнута (толщина меняется по высоте) — берём с запасом
    wF = smoothstep(0.3, 0.55, n.z);
    wB = smoothstep(0.3, 0.55, -n.z);
    wS = smoothstep(0.55, 0.85, abs(n.x));
  } else if (uHasSide > 0.5) {
    // круглый: сторону выбираем по тому, куда смотрит поверхность (горизонтальная нормаль), а не по углу
    // вокруг оси — у плоских широких деталей (бантик, крышка-пластина) почти вся передняя часть смотрит
    // на зрителя и берёт фото спереди; на стыке видов — короткий плавный переход, без двоения
    vec2 nh = n.xz;
    nh = length(nh) > 1e-4 ? normalize(nh) : vec2(0.0, 1.0);
    float c = nh.y;
    float sn = nh.x;
    wF = smoothstep(0.62, 0.78, c);
    wB = smoothstep(0.62, 0.78, -c);
    wS = smoothstep(0.62, 0.78, abs(sn));
    float sum = max(wF + wB + wS, 1e-3);
    wF /= sum;
    wB /= sum;
    wS /= sum;
  } else {
    wF = smoothstep(-0.05, 0.25, n.z);
    wB = smoothstep(-0.05, 0.25, -n.z);
    wS = 0.0;
  }

  float aF, aB, aS;
  vec3 front = viewOr(map, uv, side, 1.0, aF);
  // сзади смотрим с другой стороны — фото зеркально по ширине
  vec3 back = viewOr(backMap, vec2(1.0 - uv.x, uv.y), side, uHasBack, aB);
  // бок: по глубине; у правой и левой грани направления противоположны
  float sx = (uFlat > 0.5 ? n.x : vPos.x) > 0.0 ? (uDepth * 0.5 - vPos.z) / uDepth : (vPos.z + uDepth * 0.5) / uDepth;
  vec3 sideImg = viewOr(sideMap, vec2(clamp(sx, 0.0, 1.0), uv.y), side, uHasSide, aS);

  // свет для того, что окрашено цветом флакона (верх, низ, переходы): мягкий + блик + светлая кромка
  vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
  float diff = 0.5 + 0.55 * max(dot(vn, L), 0.0);
  vec3 h = normalize(L + v);
  float spec = pow(max(dot(vn, h), 0.0), 60.0) * 0.5;
  float rim = pow(1.0 - max(dot(vn, v), 0.0), 3.0) * 0.25;
  vec3 col = side * diff + vec3(spec + rim);

  // фото уже освещены — им лишь чуть подсвечиваем/притеняем объём, чтобы стороны различались
  float shade = 0.82 + 0.25 * max(dot(vn, L), 0.0);
  col = mix(col, front, wF);
  col = mix(col, back * shade, wB);
  col = mix(col, sideImg * shade, wS);
  // блик софтбокса и кромка поверх всех сторон — стекло
  col += vec3(spec * 0.6 + rim * 0.5) * (1.0 - wF);

  // стекло: где оно в этой точке (спереди и сзади — по карте, на боках — у края на этой высоте)
  float gF = texture2D(maskMap, uv).r;
  float gB = texture2D(maskMap, vec2(1.0 - uv.x, uv.y)).r;
  float gS = texture2D(glassStrip, vec2(0.5, uv.y)).r;
  float glass = uHasMask * clamp(gF * wF + gB * wB + gS * clamp(1.0 - wF - wB, 0.0, 1.0), 0.0, 1.0);
  float fres = pow(1.0 - abs(dot(vn, v)), 2.5);
  // стекло пропускает: сквозь него видно жидкость и дальнюю стенку; к краю (под углом) — плотнее
  float alpha = 1.0 - glass * mix(0.6, 0.12, fres);
  // толстая кромка стекла чуть темнее и зеленит, по ней — яркий блик софтбокса
  col = mix(col, col * vec3(0.78, 0.86, 0.84), glass * fres * 0.6);
  vec3 L2 = normalize(vec3(0.75, 0.35, 0.55));
  float streak = pow(max(dot(vn, normalize(L + v)), 0.0), 140.0) + pow(max(dot(vn, normalize(L2 + v)), 0.0), 220.0) * 0.6;
  col += vec3(1.0) * glass * (streak * 0.9 + fres * 0.35);
  alpha = max(alpha, glass * clamp(streak, 0.0, 1.0));

  // светлая тема: дальние и невыбранные флаконы не темнеют, а тают в светлой дымке
  vec3 haze = vec3(0.904, 0.863, 0.807);
  vec3 lit = uDim >= 1.0 ? col * uDim : mix(haze, col, uDim);
  gl_FragColor = vec4(lit, alpha);
  #include <colorspace_fragment>
}`;

// жидкость: цвет с фото на этой высоте; в толще (по центру) светлее — свет проходит насквозь, к краям гуще
const liquidFrag = /* glsl */ `
uniform sampler2D liquid;
uniform float uH;
uniform float uTop;
uniform float uDim;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vViewN;
varying vec3 vViewPos;
void main(){
  float y = vPos.y / uH;
  vec4 l = texture2D(liquid, vec2(0.5, y));
  if (l.a < 0.5) discard;
  vec3 vn = normalize(vViewN);
  if (!gl_FrontFacing) vn = -vn;
  vec3 v = normalize(-vViewPos);
  float facing = max(dot(vn, v), 0.0);
  vec3 col = l.rgb * (0.72 + 0.4 * facing) * (gl_FrontFacing ? 1.0 : 0.8);
  // мениск: тонкая светлая линия у поверхности
  col += vec3(0.35) * smoothstep(uTop - 0.012, uTop, y);
  vec3 haze = vec3(0.904, 0.863, 0.807);
  vec3 lit = uDim >= 1.0 ? col * uDim : mix(haze, col, uDim);
  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
}`;

export function buildSolid(img: HTMLImageElement, tex: THREE.Texture, H: number, spec: SolidSpec, views: SolidViews = {}) {
  const aspect = img.naturalWidth / img.naturalHeight;
  const W = H * aspect;
  const { rows, strip } = readSilhouette(img);
  // координаты: x — от центра фото, y — от низа флакона
  const X = (u: number) => (u - 0.5) * W;
  const Y = (t: number) => (1 - t) * H;

  // толщина плоского флакона: по фото сбоку (оно той же высоты), иначе — из описания
  const sideImg = views.side?.image as HTMLImageElement | undefined;
  const D =
    spec.kind === "flat"
      ? THREE.MathUtils.clamp(sideImg ? H * (sideImg.width / sideImg.height) : W * (spec.depth ?? 0.45), W * 0.2, W * 1.05)
      : sideImg
        ? THREE.MathUtils.clamp(H * (sideImg.width / sideImg.height), W * 0.5, W * 1.6)
        : W;

  let geo: THREE.BufferGeometry;
  if (spec.kind === "round") {
    // тело вращения: радиус на каждой высоте — половина ширины силуэта
    const pts: THREE.Vector2[] = [];
    const last = rows[rows.length - 1];
    pts.push(new THREE.Vector2(0, Y(last.y)));
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      pts.push(new THREE.Vector2(Math.max(0.001, ((r.r - r.l) / 2) * W), Y(r.y)));
    }
    pts.push(new THREE.Vector2(0, Y(rows[0].y)));
    geo = new THREE.LatheGeometry(pts, 72);
    // сечение по двум видам: спереди — ширина, сбоку — глубина на этой высоте. Так бантик, пробка,
    // воротничок не превращаются в широкое кольцо вокруг флакона, а имеют свою настоящую толщину
    if (sideImg) {
      const prof = readSilhouette(sideImg).rows;
      const sideAsp = sideImg.width / sideImg.height;
      const at = (list: { y: number; l: number; r: number }[], t: number) => {
        let lo = list[0];
        let hi = list[list.length - 1];
        for (const r of list) {
          if (r.y <= t) lo = r;
          if (r.y >= t) {
            hi = r;
            break;
          }
        }
        const k = hi.y > lo.y ? (t - lo.y) / (hi.y - lo.y) : 0;
        return (lo.r - lo.l) * (1 - k) + (hi.r - hi.l) * k;
      };
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp(1 - pos.getY(i) / H, 0, 1);
        const front = at(rows, t) * W; // ширина спереди на этой высоте
        const depth = at(prof, t) * sideAsp * H; // ширина сбоку
        if (front > 1e-4) pos.setZ(i, pos.getZ(i) * THREE.MathUtils.clamp(depth / front, 0.25, 2));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  } else {
    // плоский: силуэт, выдавленный на нужную толщину, со скруглёнными рёбрами
    const shape = new THREE.Shape();
    rows.forEach((r, i) => (i === 0 ? shape.moveTo(X(r.r), Y(r.y)) : shape.lineTo(X(r.r), Y(r.y))));
    for (let i = rows.length - 1; i >= 0; i--) shape.lineTo(X(rows[i].l), Y(rows[i].y));
    shape.closePath();
    const bevel = Math.min(D * 0.22, W * 0.04);
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, D - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 4,
      curveSegments: 4,
    });
    geo.translate(0, 0, -(D - bevel * 2) / 2);
    // толщина на каждой высоте — по силуэту на фото сбоку: крышка и горлышко тоньше корпуса,
    // форма собирается сразу из двух видов (анфас и профиль)
    if (sideImg) {
      const prof = readSilhouette(sideImg).rows;
      const widthAt = (t: number) => {
        // t — доля высоты сверху; ширина силуэта сбоку в долях его самой широкой строки
        let lo = prof[0];
        let hi = prof[prof.length - 1];
        for (const r of prof) {
          if (r.y <= t) lo = r;
          if (r.y >= t) {
            hi = r;
            break;
          }
        }
        const k = hi.y > lo.y ? (t - lo.y) / (hi.y - lo.y) : 0;
        return (lo.r - lo.l) * (1 - k) + (hi.r - hi.l) * k;
      };
      const maxW = Math.max(...prof.map((r) => r.r - r.l));
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp(1 - pos.getY(i) / H, 0, 1);
        pos.setZ(i, pos.getZ(i) * Math.max(0.06, widthAt(t) / maxW));
      }
      pos.needsUpdate = true;
    }
    geo.computeVertexNormals();
  }

  const dim = { value: 1 };
  const maskImg = views.mask?.image as HTMLImageElement | undefined;
  const liq = maskImg ? readLiquid(img, maskImg) : null;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      backMap: { value: views.back ?? tex },
      sideMap: { value: views.side ?? tex },
      strip: { value: strip },
      uHasBack: { value: views.back ? 1 : 0 },
      uHasSide: { value: views.side ? 1 : 0 },
      uBox: { value: new THREE.Vector4(-W / 2, 0, W, H) },
      uDepth: { value: D },
      uDim: dim,
      uFlat: { value: spec.kind === "flat" ? 1 : 0 },
      maskMap: { value: views.mask ?? tex },
      glassStrip: { value: liq?.glass ?? strip },
      uHasMask: { value: views.mask ? 1 : 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.FrontSide,
    transparent: true,
  });
  // ближняя стенка — эта сетка (по ней же выбирают флакон); дальняя стенка — та же форма изнутри
  const mesh = new THREE.Mesh(geo, mat);
  const backMat = mat.clone();
  backMat.uniforms = mat.uniforms; // общие значения (затемнение и т. п.)
  backMat.side = THREE.BackSide;
  const backWall = new THREE.Mesh(geo, backMat);
  mesh.add(backWall);

  // жидкость: та же форма, чуть меньше (стенки стекла), видна только между дном и уровнем
  let liquidGeo: THREE.BufferGeometry | null = null;
  let liquidMat: THREE.ShaderMaterial | null = null;
  if (liq?.has) {
    liquidGeo = geo.clone();
    liquidGeo.scale(spec.kind === "flat" ? 0.88 : 0.86, 1, spec.kind === "flat" ? 0.76 : 0.86);
    liquidMat = new THREE.ShaderMaterial({
      uniforms: { liquid: { value: liq.liquid }, uH: { value: H }, uTop: { value: liq.top }, uDim: dim },
      vertexShader: vert,
      fragmentShader: liquidFrag,
      side: THREE.DoubleSide,
    });
    mesh.add(new THREE.Mesh(liquidGeo, liquidMat));
  }
  return {
    mesh,
    setDim(v: number) {
      dim.value = v;
    },
    /** порядок прозрачного: дальняя стенка, потом ближняя (жидкость непрозрачна — рисуется раньше) */
    setOrder(o: number) {
      backWall.renderOrder = o;
      mesh.renderOrder = o + 1;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      backMat.dispose();
      liquidGeo?.dispose();
      liquidMat?.dispose();
      liq?.liquid.dispose();
      liq?.glass.dispose();
      strip.dispose();
      views.back?.dispose();
      views.side?.dispose();
      views.mask?.dispose();
    },
  };
}
