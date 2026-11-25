import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * «Настоящий» флакон из точных форм по фото анфас: стеклянная оболочка с толстым дном,
 * жидкость внутри, надпись — только буквы с фото, напечатанные на переднем стекле, крышка и воротничок.
 * Используется, когда у сгенерированной модели кривые бока.
 *
 * Части задаются долями фото: top/bottom — доли высоты сверху, width — доля ширины.
 */
export type RealBottleSpec = {
  /** корпус-коробка: глубина в долях ширины, скругление рёбер в долях высоты */
  body: { top: number; width: number; depth: number; round: number };
  /** толщина стенок (доля ширины корпуса) и дна (доля высоты фото), уровень жидкости (доля внутренней высоты) */
  glass: { wall: number; base: number; fill: number };
  /** цилиндры сверху вниз: крышка, воротничок…; finish — из чего */
  parts: { top: number; bottom: number; width: number; finish: "gloss" | "metal" }[];
  /** какие пиксели фото считать надписью: золотые буквы (R заметно больше B) */
  letters: "gold";
};

type Swap = { mesh: THREE.Mesh; lite: THREE.Material; glass: THREE.Material };

/** Затемнение (дальние флаконы, невыбранные) одним общим значением на все материалы флакона */
function withDim<T extends THREE.Material>(m: T, dim: { value: number }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDim = dim;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDim;")
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\ngl_FragColor.rgb *= uDim;");
  };
  m.customProgramCacheKey = () => "dim";
  return m;
}

/** Средний цвет тела флакона (без букв) и текстура «только буквы» из фото */
function readPhoto(img: HTMLImageElement, bodyTop: number) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = Math.floor(c.height * (bodyTop + 0.08)); y < c.height * 0.9; y += 3)
    for (let x = Math.floor(c.width * 0.12); x < c.width * 0.88; x += 3) {
      const i = (y * c.width + x) * 4;
      if (d[i] - d[i + 2] > 20) continue; // буквы не в счёт
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
  // фото снято на тёмном фоне — жидкость на нём темнее, чем выглядит на свету: чуть осветляем, сохраняя оттенок
  const k = 1.9;
  const body = new THREE.Color().setRGB(Math.min(1, (r / n / 255) * k), Math.min(1, (gg / n / 255) * k), Math.min(1, (b / n / 255) * k), THREE.SRGBColorSpace);
  // буквы: золото заметно «желтее», чем синее стекло; всё остальное прозрачно
  for (let i = 0; i < d.length; i += 4) {
    const k = THREE.MathUtils.clamp((d[i] - d[i + 2] - 35) / 45, 0, 1);
    d[i + 3] = Math.round(d[i + 3] * k);
  }
  g.putImageData(id, 0, 0);
  const letters = new THREE.CanvasTexture(c);
  letters.colorSpace = THREE.SRGBColorSpace;
  letters.anisotropy = 8;
  return { body, letters };
}

function liquidDepth() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 58, 8, 64, 64, 92);
  gr.addColorStop(0, "#ffffff");
  gr.addColorStop(0.55, "#c9c9c9");
  gr.addColorStop(1, "#6e6e6e");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRealBottle(spec: RealBottleSpec, H: number, img: HTMLImageElement, studio: THREE.Texture) {
  const aspect = img.naturalWidth / img.naturalHeight;
  const W = H * aspect;
  const dim = { value: 1 };
  const group = new THREE.Group();
  const swaps: Swap[] = [];
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const { body: liquidColor, letters } = readPhoto(img, spec.body.top);
  keep(letters);

  // ── корпус: стеклянная оболочка
  const bw = spec.body.width * W;
  const bh = (1 - spec.body.top) * H;
  const bd = bw * spec.body.depth;
  const round = Math.min(spec.body.round * H, bw / 4);
  const tint = liquidColor.clone().lerp(new THREE.Color("#ffffff"), 0.55);
  const glassReal = keep(
    withDim(
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        transmission: 1,
        thickness: bd * 0.5,
        ior: 1.5,
        roughness: 0.02,
        attenuationColor: tint,
        attenuationDistance: 0.9,
        specularIntensity: 0.8,
        envMap: studio,
        envMapIntensity: 0.9,
      }),
      dim,
    ),
  );
  // без преломления (общий план, телефоны): тонкое полупрозрачное стекло — жидкость видна сквозь него
  const glassLite = keep(
    withDim(
      new THREE.MeshPhysicalMaterial({
        color: tint,
        transparent: true,
        opacity: 0.2,
        roughness: 0.02,
        envMap: studio,
        envMapIntensity: 1.3,
        depthWrite: false,
      }),
      dim,
    ),
  );
  const shell = new THREE.Mesh(keep(new RoundedBoxGeometry(bw, bh, bd, 5, round)), glassLite);
  shell.position.y = bh / 2;
  shell.renderOrder = 2;
  swaps.push({ mesh: shell, lite: glassLite, glass: glassReal });

  // ── жидкость внутри: чуть меньше корпуса, над толстым дном. На каждой грани мягкий градиент:
  // в толще жидкости центр светлее (свет проходит), к краям темнее — как у настоящей
  const depthTex = keep(liquidDepth());
  const wall = spec.glass.wall * bw;
  const base = spec.glass.base * H;
  const innerH = (bh - base - wall) * spec.glass.fill;
  const liquidMat = keep(
    withDim(
      new THREE.MeshPhysicalMaterial({
        color: liquidColor,
        map: depthTex,
        emissiveMap: depthTex,
        roughness: 0.08,
        metalness: 0,
        clearcoat: 0.6,
        envMap: studio,
        envMapIntensity: 0.6,
        // лёгкое собственное свечение — свет, прошедший сквозь жидкость
        emissive: liquidColor,
        emissiveIntensity: 0.55,
      }),
      dim,
    ),
  );
  const liquid = new THREE.Mesh(
    keep(new RoundedBoxGeometry(bw - wall * 2, innerH, bd - wall * 2, 4, Math.max(0.001, round - wall * 0.6))),
    liquidMat,
  );
  liquid.position.y = base + innerH / 2;
  liquid.renderOrder = 1;

  // ── надпись: только буквы с фото на переднем стекле (золотая печать, чуть блестит)
  const lettersMat = keep(
    withDim(
      new THREE.MeshStandardMaterial({
        map: letters,
        transparent: true,
        metalness: 0.7,
        roughness: 0.32,
        envMap: studio,
        envMapIntensity: 1.4,
        depthWrite: false,
      }),
      dim,
    ),
  );
  const decal = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), lettersMat);
  decal.position.set(0, H / 2, bd / 2 + 0.002);
  decal.renderOrder = 3;

  group.add(liquid, shell, decal);

  // ── крышка, воротничок
  for (const p of spec.parts) {
    const h = (p.bottom - p.top) * H;
    const rad = (p.width * W) / 2;
    const rr = Math.min(0.006 * H, rad / 3, h / 3);
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(rad, 0), new THREE.Vector2(rad, h - rr)];
    for (let k = 1; k <= 6; k++) {
      const t = (k / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(rad - rr + Math.cos(t) * rr, h - rr + Math.sin(t) * rr));
    }
    pts.push(new THREE.Vector2(0, h));
    const mat = keep(
      withDim(
        p.finish === "metal"
          ? new THREE.MeshPhysicalMaterial({ color: "#2a2c33", metalness: 1, roughness: 0.22, envMap: studio, envMapIntensity: 1.6 })
          : new THREE.MeshPhysicalMaterial({
              color: "#0a0b10",
              roughness: 0.12,
              clearcoat: 1,
              clearcoatRoughness: 0.04,
              envMap: studio,
              envMapIntensity: 1.8,
            }),
        dim,
      ),
    );
    const m = new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 72)), mat);
    m.position.y = (1 - p.bottom) * H;
    group.add(m);
  }

  return {
    group,
    swaps,
    label: {
      setDim(v: number) {
        dim.value = v;
      },
      setMix() {},
      update() {},
    },
    dispose() {
      disposables.forEach((x) => x.dispose());
    },
  };
}
