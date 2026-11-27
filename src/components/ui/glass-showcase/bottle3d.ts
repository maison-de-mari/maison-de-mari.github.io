import * as THREE from "three";
import { buildPhotoCap, type PhotoCap } from "./photo-cap";

/**
 * Фотореалистичный стеклянный флакон с парфюмом (Three.js) — по утверждённому образцу flakon-namuna.html.
 * Из образца без изменений: материал жидкости (transmission 1, ior 1.36, roughness 0, thickness 1.5,
 * attenuationDistance 2.4), толщина жидкости от угла взгляда (patchThickness), поверхность жидкости
 * горизонтальна в мире и после наклона пружиной раскачивается и успокаивается, мениск у стенки,
 * softbox-окружение (PMREM, без HDRI-файлов), трубка, каустика, тень.
 * По-своему: форма каждого флакона (сечение — суперэллипс: круглый или прямоугольный со скруглёнными
 * углами, плечи, горлышко, крышка), настоящая этикетка-картинка, цвет парфюма → attenuationColor.
 * Стенка стекла — как в образце (отражения + затемнение к краю): стандартная transmission не видит
 * вложенные прозрачные объекты, с «настоящей» стенкой жидкость внутри пропала бы.
 */

/** glass — горлышко (часть стеклянной оболочки); crystal — отдельная деталь из прозрачного стекла (крышка) */
export type Finish = "glass" | "crystal" | "gold" | "silver" | "black" | "white";
export type Part = { kind: "round" | "rect" | "dome" | "crown"; top: number; bottom: number; width: number; depth?: number; finish: Finish };
export type Shape = {
  /** ширина / высота флакона на фото анфас */
  aspect: number;
  body: { kind: "round" | "rect"; top: number; width?: number; depth?: number; cut?: number };
  /** части над корпусом: top/bottom — доли высоты сверху, width — доля ширины */
  parts: Part[];
  /** где на фото этикетка: доли ширины и высоты (x0, y0, x1, y1) */
  label?: [number, number, number, number];
};
export type Bottle3DSpec = {
  slug: string;
  color: string;
  fill?: number;
  label?: string;
  /** этикетка — печать прямо на стекле (картинка с прозрачным фоном), а не бумага */
  labelPrint?: boolean;
  /** крышка из фотографий (лист снимков с разных сторон) вместо нарисованной */
  photoCap?: PhotoCap;
  shape: Shape;
};

export const HT = 4.4; // высота флакона в единицах сцены
const WALL = 0.075;
const BASE = 0.3;
const MEN = 0.03;
const SEG = 72;
const ROWS = 10;
const RINGS = 16;

type Ring = { a: number; b: number; n: number; y: number };

/** точки сечения-суперэллипса (n = 2 — эллипс, больше — прямоугольник со скруглёнными углами); t = 0 — перёд (+z) */
function outline(a: number, b: number, n: number): [number, number][] {
  const p = 2 / n;
  return Array.from({ length: SEG + 1 }, (_, j) => {
    const t = (j / SEG) * Math.PI * 2;
    const s = Math.sin(t);
    const c = Math.cos(t);
    return [a * Math.sign(s) * Math.abs(s) ** p, b * Math.sign(c) * Math.abs(c) ** p];
  });
}

/** оболочка по кольцам снизу вверх; дно и верх закрываются «веером» */
function sweep(rings: Ring[], closeBottom = true, closeTop = true) {
  const pos: number[] = [];
  const idx: number[] = [];
  rings.forEach((r) => outline(r.a, r.b, r.n).forEach(([x, z]) => pos.push(x, r.y, z)));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  if (closeBottom) {
    const c = pos.length / 3;
    pos.push(0, rings[0].y, 0);
    for (let j = 0; j < SEG; j++) idx.push(c, j + 1, j);
  }
  if (closeTop) {
    const c = pos.length / 3;
    const top = rings.length - 1;
    pos.push(0, rings[top].y, 0);
    for (let j = 0; j < SEG; j++) idx.push(c, top * (SEG + 1) + j, top * (SEG + 1) + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function blob(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function patchThickness(m: THREE.MeshPhysicalMaterial, lo: number, hi: number) {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      "material.thickness = thickness;",
      `material.thickness = thickness * ( ${lo.toFixed(2)} + ${hi.toFixed(2)} * abs( dot( normal, normalize( vViewPosition ) ) ) );`,
    );
  };
  m.customProgramCacheKey = () => `pfliq${lo}${hi}`;
}

/** Softbox-окружение из образца: тёплая студия, полосы света, верхний свет, контровой */
export function softboxEnv(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x6f6a64, side: THREE.BackSide })));
  const panel = (w: number, h: number, x: number, y: number, z: number, i: number, col = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 1.5, 0);
    env.add(m);
  };
  panel(7, 12, -11, 5, 5, 9);
  panel(2.2, 12, 10, 4, 7, 12);
  panel(12, 6, 0, 16, 2, 5);
  panel(5, 9, 7, 3, -12, 3, 0xfff1dd);
  panel(14, 5, 0, -12, 0, 1.2, 0xefeae2);
  panel(3, 10, -4, 2, 14, 0.02, 0x000000);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return tex;
}

const FIN: Record<Exclude<Finish, "glass">, () => THREE.Material> = {
  crystal: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.5,
      thickness: 0.8,
      roughness: 0.04,
      attenuationColor: new THREE.Color(0xe4efea),
      attenuationDistance: 1.4,
      envMapIntensity: 1.3,
    }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd8b06a, metalness: 1, roughness: 0.24, envMapIntensity: 1.15 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xd9d9d6, metalness: 1, roughness: 0.18 }),
  black: () => new THREE.MeshPhysicalMaterial({ color: 0x0c0b0d, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 }),
  white: () => new THREE.MeshPhysicalMaterial({ color: 0xf2efe9, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
};

/** Флакон: сцена, обновление жидкости за шаг; уничтожение */
export function buildBottle(
  spec: Bottle3DSpec,
  bg: THREE.ColorRepresentation,
  envMap: THREE.Texture,
  labelTex?: THREE.Texture,
  capTex?: THREE.Texture,
) {
  const sh = spec.shape;
  const W = sh.aspect * HT;
  const bw = (sh.body.width ?? 1) * W;
  const round = sh.body.kind === "round";
  const bd = bw * (round ? (sh.body.depth ?? 1) : (sh.body.depth ?? 0.55));
  const a = bw / 2;
  const b = bd / 2;
  const n = round ? 2 : Math.max(4, 0.9 / (sh.body.cut ?? 0.12));
  const bodyTopY = (1 - sh.body.top) * HT;
  const shoulder = Math.min(bodyTopY * 0.12, round ? 0.08 * HT : 0.035 * HT);
  const straightTop = bodyTopY - shoulder;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.environment = envMap;
  const bottle = new THREE.Group();
  scene.add(bottle);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ── горлышко (стеклянная часть над корпусом) — продолжение оболочки
  const neck = sh.parts.find((p) => p.finish === "glass");
  const neckW = (neck?.width ?? 0.36) * W;
  const neckRound = !neck || neck.kind !== "rect";
  const na = neckW / 2;
  const nb = neckRound ? na : na * (neck?.depth ?? 0.7);
  const nn = neckRound ? 2 : 6;
  const neckTopY = neck ? (1 - neck.top) * HT : bodyTopY + 0.12;

  const rings: Ring[] = [
    { a: a * 0.9, b: b * 0.9, n, y: 0 },
    { a: a * 0.985, b: b * 0.985, n, y: 0.04 },
    { a, b, n, y: 0.1 },
    { a, b, n, y: straightTop },
  ];
  for (let k = 1; k <= 6; k++) {
    const t = k / 6;
    const s = Math.cos((t * Math.PI) / 2);
    rings.push({ a: na + (a - na) * s, b: nb + (b - nb) * s, n: nn + (n - nn) * s, y: straightTop + shoulder * Math.sin((t * Math.PI) / 2) });
  }
  rings.push({ a: na, b: nb, n: nn, y: neckTopY });
  const outerGeo = keep(sweep(rings));

  // стекло — как в образце: затемнение к краю + отражения (аддитивно) + внутренняя стенка
  const edgeMat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}",
      fragmentShader:
        "varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.6);gl_FragColor=vec4(0.20,0.25,0.24,f*0.6);}",
    }),
  );
  const reflMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.03,
      metalness: 0,
      ior: 1.5,
      envMapIntensity: 1.25,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const gEdge = new THREE.Mesh(outerGeo, edgeMat);
  gEdge.renderOrder = 5;
  const gRefl = new THREE.Mesh(outerGeo, reflMat);
  gRefl.renderOrder = 6;
  const ia = a - WALL;
  const ib = b - WALL;
  const innerGeo = keep(
    sweep(
      [
        { a: ia, b: ib, n, y: BASE + 0.04 },
        { a: ia, b: ib, n, y: straightTop },
        { a: na - WALL * 0.6, b: nb - WALL * 0.6, n: nn, y: bodyTopY - 0.02 },
      ],
      false,
      false,
    ),
  );
  const gInner = new THREE.Mesh(
    innerGeo,
    keep(
      new THREE.MeshPhysicalMaterial({
        color: 0x000000,
        roughness: 0.05,
        ior: 1.5,
        envMapIntensity: 0.5,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    ),
  );
  gInner.renderOrder = 1;
  bottle.add(gInner, gEdge, gRefl);

  // толстое дно — честное стекло с преломлением
  const baseMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.5,
      thickness: 0.9,
      roughness: 0.02,
      attenuationColor: new THREE.Color(0xdcebe4),
      attenuationDistance: 1.6,
    }),
  );
  const baseGlass = new THREE.Mesh(
    keep(
      sweep([
        { a: a * 0.9, b: b * 0.9, n, y: 0.012 },
        { a: a - 0.035, b: b - 0.035, n, y: 0.03 },
        { a: a - 0.012, b: b - 0.012, n, y: 0.09 },
        { a: a - 0.012, b: b - 0.012, n, y: BASE - 0.02 },
      ]),
    ),
    baseMat,
  );
  bottle.add(baseGlass);

  // ── жидкость
  const liqCol = new THREE.Color(spec.color);
  const liqMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.36,
      thickness: 1.5,
      roughness: 0,
      attenuationColor: liqCol.clone(),
      attenuationDistance: 2.4,
      envMapIntensity: 0.9,
    }),
  );
  patchThickness(liqMat, 0.25, 1.5);
  const capLiqMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.36,
      thickness: 0.7,
      roughness: 0.02,
      attenuationColor: liqCol.clone(),
      attenuationDistance: 1.6,
      envMapIntensity: 1.3,
      side: THREE.DoubleSide,
    }),
  );
  const la = ia - 0.004;
  const lb = ib - 0.004;
  const base = outline(la, lb, n); // точки сечения жидкости
  // нормали сечения — наружу
  const bn = base.map((_, j) => {
    const p = base[(j + SEG - 1) % SEG];
    const q = base[(j + 1) % SEG];
    let nx = q[1] - p[1];
    let nz = -(q[0] - p[0]);
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    if (nx * base[j][0] + nz * base[j][1] < 0) {
      nx = -nx;
      nz = -nz;
    }
    return [nx, nz];
  });
  const Y0 = BASE;
  const FILL = Y0 + (spec.fill ?? 0.75) * (straightTop - Y0);
  const rowS = [1 - 0.07 / la];
  const rowT = [0];
  for (let i = 0; i <= ROWS; i++) {
    rowS.push(1);
    rowT.push(0.045 + ((1 - 0.045) * i) / ROWS);
  }
  const wallN = rowS.length * (SEG + 1) + 1;
  const wPos = new Float32Array(wallN * 3);
  const wNor = new Float32Array(wallN * 3);
  const wIdx: number[] = [];
  for (let i = 0; i < rowS.length; i++)
    for (let j = 0; j <= SEG; j++) {
      const k = (i * (SEG + 1) + j) * 3;
      wPos[k] = base[j][0] * rowS[i];
      wPos[k + 2] = base[j][1] * rowS[i];
      if (i === 0) {
        wNor[k] = bn[j][0] * 0.6;
        wNor[k + 1] = -0.8;
        wNor[k + 2] = bn[j][1] * 0.6;
      } else {
        wNor[k] = bn[j][0];
        wNor[k + 2] = bn[j][1];
      }
    }
  for (let i = 0; i < rowS.length - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const p = i * (SEG + 1) + j;
      const q = p + SEG + 1;
      wIdx.push(p, p + 1, q, q, p + 1, q + 1);
    }
  const cI = wallN - 1;
  wPos[cI * 3 + 1] = Y0;
  wNor[cI * 3 + 1] = -1;
  for (let j = 0; j < SEG; j++) wIdx.push(cI, j + 1, j);
  const wallGeo = keep(new THREE.BufferGeometry());
  wallGeo.setAttribute("position", new THREE.BufferAttribute(wPos, 3));
  wallGeo.setAttribute("normal", new THREE.BufferAttribute(wNor, 3));
  wallGeo.setIndex(wIdx);
  const liqWall = new THREE.Mesh(wallGeo, liqMat);
  liqWall.frustumCulled = false;

  const capN = 1 + RINGS * (SEG + 1);
  const cPos = new Float32Array(capN * 3);
  const cU = new Float32Array(capN);
  const cIdx: number[] = [];
  for (let q = 1; q <= RINGS; q++) {
    const u = 1 - Math.pow(1 - q / RINGS, 1.7);
    for (let j = 0; j <= SEG; j++) {
      const k = 1 + (q - 1) * (SEG + 1) + j;
      cPos[k * 3] = base[j][0] * u;
      cPos[k * 3 + 2] = base[j][1] * u;
      cU[k] = u;
    }
  }
  for (let j = 0; j < SEG; j++) cIdx.push(0, 1 + j, 2 + j);
  for (let q = 1; q < RINGS; q++)
    for (let j = 0; j < SEG; j++) {
      const p = 1 + (q - 1) * (SEG + 1) + j;
      const r = p + SEG + 1;
      cIdx.push(p, r, p + 1, p + 1, r, r + 1);
    }
  const capGeo = keep(new THREE.BufferGeometry());
  capGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
  capGeo.setIndex(cIdx);
  const liqTop = new THREE.Mesh(capGeo, capLiqMat);
  liqTop.frustumCulled = false;
  bottle.add(liqWall, liqTop);

  // трубка распылителя
  const tubeLen = neckTopY - (BASE + 0.1);
  const tube = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.026, 0.026, tubeLen, 12)),
    keep(new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.35 })),
  );
  tube.position.set(Math.min(0.1, la * 0.2), BASE + 0.1 + tubeLen / 2, 0.05);
  tube.rotation.z = -0.03;
  bottle.add(tube);

  // ── крышка, воротничок (непрозрачные части)
  for (const p of sh.parts) {
    if (p.finish === "glass") continue;
    const mat = keep(FIN[p.finish]());
    const y0 = (1 - p.bottom) * HT;
    const y1 = (1 - p.top) * HT;
    const pa = (p.width * W) / 2;
    const pb = p.kind === "rect" ? pa * (p.depth ?? 0.85) : pa;
    const pn = p.kind === "rect" ? 8 : 2;
    const bev = Math.min(0.04, (y1 - y0) * 0.2);
    let geo: THREE.BufferGeometry;
    if (p.kind === "crown") {
      // корона: узкое основание, пышные «лепестки», перехват и шар наверху (по силуэту фото)
      const h = y1 - y0;
      const prof: [number, number][] = [
        [0.66, 0], [0.8, 0.08], [0.96, 0.22], [1, 0.36], [0.95, 0.52], [0.72, 0.68], [0.3, 0.8],
        [0.24, 0.84], [0.25, 0.9], [0.2, 0.96], [0.08, 1],
      ];
      geo = sweep(prof.map(([s, t]) => ({ a: pa * s + 1e-3, b: pb * s + 1e-3, n: 2, y: y0 + h * t })), true, true);
    } else if (p.kind === "dome") {
      const hb = y0 + (y1 - y0) * 0.3;
      const rs: Ring[] = [
        { a: pa, b: pb, n: 2, y: y0 },
        { a: pa, b: pb, n: 2, y: hb },
      ];
      for (let k = 1; k <= 10; k++) {
        const t = (k / 10) * (Math.PI / 2);
        rs.push({ a: pa * Math.cos(t) + 1e-3, b: pb * Math.cos(t) + 1e-3, n: 2, y: hb + (y1 - hb) * Math.sin(t) });
      }
      geo = sweep(rs, true, false);
    } else {
      geo = sweep([
        { a: pa - bev * 0.6, b: pb - bev * 0.6, n: pn, y: y0 },
        { a: pa, b: pb, n: pn, y: y0 + bev },
        { a: pa, b: pb, n: pn, y: y1 - bev },
        { a: pa - bev * 0.6, b: pb - bev * 0.6, n: pn, y: y1 },
      ]);
    }
    bottle.add(new THREE.Mesh(keep(geo), mat));
  }

  if (spec.photoCap && capTex) {
    const pc = buildPhotoCap(spec.photoCap, HT, capTex);
    bottle.add(pc.mesh);
    disposables.push(pc);
  }

  // ── этикетка — настоящая картинка
  if (labelTex && sh.label) {
    const [x0, y0f, x1, y1f] = sh.label;
    const lw = Math.min(x1 - x0, 0.98) * W;
    const yTop = Math.min((1 - y0f) * HT, straightTop - 0.02);
    const yBot = Math.max((1 - y1f) * HT, BASE * 0.6);
    const lh = yTop - yBot;
    const lmat = keep(
      spec.labelPrint
        ? // печать на стекле: прозрачный фон, глянец
          new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.25, transparent: true, depthWrite: false, side: THREE.FrontSide })
        : new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.75, side: THREE.DoubleSide }),
    );
    let lg: THREE.BufferGeometry;
    let label: THREE.Mesh;
    if (round) {
      const R = a + 0.006;
      const half = Math.asin(Math.min(0.97, lw / 2 / R));
      lg = new THREE.CylinderGeometry(R, R, lh, 48, 1, true, -half, half * 2);
      label = new THREE.Mesh(lg, lmat);
      label.scale.z = (b + 0.006) / R;
    } else {
      lg = new THREE.PlaneGeometry(lw, lh);
      label = new THREE.Mesh(lg, lmat);
      label.position.z = b + 0.006;
    }
    keep(lg);
    label.position.y = (yTop + yBot) / 2;
    if (spec.labelPrint) label.renderOrder = 7; // печать — поверх бликов стекла
    bottle.add(label);
  }

  // ── тень и каустика
  const shTex = keep(blob([[0, "rgba(40,30,20,0.42)"], [0.45, "rgba(40,30,20,0.16)"], [1, "rgba(40,30,20,0)"]]));
  const shadow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(a * 5.4, b * 4.6 + 1.2)),
    keep(new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, toneMapped: false })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.45, 0.002, -0.25);
  scene.add(shadow);
  const causMat = keep(
    new THREE.MeshBasicMaterial({
      map: keep(blob([[0, "rgba(255,255,255,0.95)"], [0.3, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]])),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      color: liqCol.clone().lerp(new THREE.Color(0xffffff), 0.25),
    }),
  );
  const caus = new THREE.Mesh(keep(new THREE.PlaneGeometry(a * 2.6, b * 1.6 + 0.6)), causMat);
  caus.rotation.x = -Math.PI / 2;
  caus.position.set(a * 1.15, 0.004, b * 0.6);
  caus.rotation.z = 0.5;
  scene.add(caus);

  // ── движение (как в образце): наклон пружиной, поверхность горизонтальна в мире и раскачивается
  const st = { yaw: -0.35, yawV: 0, tx: 0, tz: 0, ttx: 0, ttz: 0, vtx: 0, vtz: 0, ptx: 0, ptz: 0, wx: 0, wz: 0, vx: 0, vz: 0, amp: 0, T: 0 };
  const qi = new THREE.Quaternion();
  const nl = new THREE.Vector3();
  const surf = (x: number, z: number, sx: number, sz: number, t: number) =>
    FILL +
    sx * x +
    sz * z +
    st.amp * (Math.sin(5.2 * x + 3.1 * z - 9 * t) * 0.6 + Math.sin(-2.7 * x + 6.3 * z - 12.5 * t) * 0.4) +
    0.0025 * Math.sin(3 * x + 4 * z + 1.7 * t);

  function step(dt: number) {
    st.T += dt;
    st.yaw += st.yawV * dt;
    st.yawV *= Math.exp(-dt * 3);
    const K = 90;
    const C = 13;
    st.vtx += (K * (st.ttx - st.tx) - C * st.vtx) * dt;
    st.tx += st.vtx * dt;
    st.vtz += (K * (st.ttz - st.tz) - C * st.vtz) * dt;
    st.tz += st.vtz * dt;
    st.wx += Math.tan(st.tz) - Math.tan(st.ptz);
    st.wz -= Math.tan(st.tx) - Math.tan(st.ptx);
    st.ptx = st.tx;
    st.ptz = st.tz;
    st.vx += (-58 * st.wx - 2.6 * st.vx) * dt;
    st.vz += (-58 * st.wz - 2.6 * st.vz) * dt;
    st.wx += st.vx * dt;
    st.wz += st.vz * dt;
    const sp = Math.hypot(st.vx, st.vz);
    st.amp += (Math.min(0.03, sp * 0.012) - st.amp) * Math.min(1, dt * 4);
    bottle.rotation.set(st.tx, st.yaw, st.tz, "XZY");
    bottle.position.y = Math.min(a, b) * Math.sin(Math.min(1, Math.hypot(st.tx, st.tz))) * 0.6;
    bottle.updateMatrixWorld();
    qi.copy(bottle.quaternion).invert();
    nl.set(-st.wx, 1, -st.wz).normalize().applyQuaternion(qi);
    let sx = -nl.x / nl.y;
    let sz = -nl.z / nl.y;
    const m = Math.hypot(sx, sz);
    const MX = 0.62;
    if (m > MX) {
      sx *= MX / m;
      sz *= MX / m;
    }
    for (let i = 0; i < rowS.length; i++)
      for (let j = 0; j <= SEG; j++) {
        const k = (i * (SEG + 1) + j) * 3;
        const top = surf(base[j][0], base[j][1], sx, sz, st.T) + MEN;
        wPos[k + 1] = Y0 + (top - Y0) * rowT[i];
      }
    wallGeo.attributes.position.needsUpdate = true;
    cPos[1] = surf(0, 0, sx, sz, st.T);
    for (let k = 1; k < capN; k++) {
      let e = (cU[k] - 0.8) / 0.2;
      e = e < 0 ? 0 : e;
      cPos[k * 3 + 1] = surf(cPos[k * 3], cPos[k * 3 + 2], sx, sz, st.T) + MEN * e * e * e;
    }
    capGeo.attributes.position.needsUpdate = true;
    capGeo.computeVertexNormals();
  }

  /** сколько ещё «движения» осталось — когда мало, рендер можно остановить */
  const energy = () =>
    Math.abs(st.vtx) + Math.abs(st.vtz) + Math.abs(st.vx) + Math.abs(st.vz) + Math.abs(st.wx) * 4 + Math.abs(st.wz) * 4 +
    Math.abs(st.ttx - st.tx) + Math.abs(st.ttz - st.tz) + Math.abs(st.yawV) + st.amp * 10;

  step(0.016);
  return {
    scene,
    state: st,
    /** полуширина и полуглубина корпуса */
    size: { a, b },
    /** камера под эту форму */
    fit(cam: THREE.PerspectiveCamera, aspect: number) {
      cam.aspect = aspect;
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const lookY = HT * 0.46;
      const dist = Math.max((HT * 0.62) / t, (Math.max(a, b) * 2.1) / (t * aspect));
      cam.position.set(0, lookY + dist * 0.12, dist);
      cam.lookAt(0, lookY, 0);
      cam.updateProjectionMatrix();
    },
    step,
    energy,
    shake() {
      const ang = Math.random() * Math.PI * 2;
      st.vx += Math.cos(ang) * 2.2;
      st.vz += Math.sin(ang) * 2.2;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export type Bottle3D = ReturnType<typeof buildBottle>;
