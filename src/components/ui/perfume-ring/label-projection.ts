import * as THREE from "three";

/**
 * Настоящая этикетка и настоящие материалы на сгенерированной 3D-модели.
 * Image-to-3D хорошо угадывает форму флакона, но надписи выходят кашей, а материал — одним куском.
 * Поэтому: 1) находим, какой стороной модель смотрит «как на фото» (перебор поворотов и сравнение с фото),
 * 2) проецируем фото на переднюю половину, на бока и спину — цвет края флакона (без выдуманных букв),
 * 3) по карте материалов (разметка по фото) у каждой точки свой материал: стекло, металл, бумага, лак.
 */

const W = 40;
const H = 96;

/** Пиксели фото, обрезанного по флакону и растянутого в W×H (так же растягивается и рендер) */
function photoPixels(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2)
    for (let x = 0; x < c.width; x += 2)
      if (d[(y * c.width + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const s = document.createElement("canvas");
  s.width = W;
  s.height = H;
  const sg = s.getContext("2d", { willReadFrequently: true })!;
  sg.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, W, H);
  return {
    px: sg.getImageData(0, 0, W, H).data,
    aspect: (x1 - x0 + 1) / (y1 - y0 + 1),
    // доля фото, занятая флаконом (для UV проекции)
    uv: new THREE.Vector4(x0 / c.width, 1 - (y1 + 1) / c.height, (x1 - x0 + 1) / c.width, (y1 - y0 + 1) / c.height),
  };
}

const toSrgb = (v: number) => Math.round(255 * Math.pow(v / 255, 1 / 2.2));

/** Поворачивает модель вокруг Y так, чтобы спереди (+Z) была сторона как на фото. Возвращает угол. */
export function alignToPhoto(renderer: THREE.WebGLRenderer, model: THREE.Object3D, img: HTMLImageElement): number {
  const { px, aspect } = photoPixels(img);
  const parent = model.parent;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0, 1, 3);
  scene.add(sun);
  scene.add(model);

  const rt = new THREE.WebGLRenderTarget(W, H);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const buf = new Uint8Array(W * H * 4);
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  let best = 0;
  let bestScore = Infinity;
  const box = new THREE.Box3();
  for (let deg = 0; deg < 360; deg += 5) {
    model.rotation.y = THREE.MathUtils.degToRad(deg);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    cam.left = box.min.x;
    cam.right = box.max.x;
    cam.top = box.max.y;
    cam.bottom = box.min.y;
    cam.position.set(0, 0, box.max.z + 5);
    cam.lookAt(0, 0, box.max.z);
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);

    // сравниваем цвет (без учёта общей яркости — свет у фото и у рендера разный)
    let n = 0, mr = 0, mg = 0, mb = 0, pr = 0, pg = 0, pb = 0;
    const both: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = ((H - 1 - y) * W + x) * 4; // рендер перевёрнут по Y
        const j = (y * W + x) * 4;
        if (buf[i + 3] > 128 && px[j + 3] > 128) {
          both.push(i, j);
          mr += toSrgb(buf[i]); mg += toSrgb(buf[i + 1]); mb += toSrgb(buf[i + 2]);
          pr += px[j]; pg += px[j + 1]; pb += px[j + 2];
          n++;
        }
      }
    if (n < W * H * 0.15) continue;
    mr /= n; mg /= n; mb /= n; pr /= n; pg /= n; pb /= n;
    let diff = 0;
    for (let k = 0; k < both.length; k += 2) {
      const i = both[k], j = both[k + 1];
      diff +=
        Math.abs(toSrgb(buf[i]) - mr - (px[j] - pr)) +
        Math.abs(toSrgb(buf[i + 1]) - mg - (px[j + 1] - pg)) +
        Math.abs(toSrgb(buf[i + 2]) - mb - (px[j + 2] - pb));
    }
    // широкая грань флакона ≠ узкий бок: силуэт модели должен быть таких же пропорций, как на фото
    const ma = (box.max.x - box.min.x) / (box.max.y - box.min.y);
    const score =
      diff / n + (Math.abs(mr - pr) + Math.abs(mg - pg) + Math.abs(mb - pb)) * 0.3 + Math.abs(Math.log(ma / aspect)) * 400;
    if (score < bestScore - 0.5) {
      bestScore = score;
      best = deg;
    }
  }

  renderer.setRenderTarget(null);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(0x000000, prevClear);
  rt.dispose();
  model.rotation.y = THREE.MathUtils.degToRad(best);
  model.updateMatrixWorld(true);
  if (parent) parent.add(model);
  return best;
}

/**
 * Цвет края флакона на каждой высоте — один раз при загрузке (раньше считался в шейдере в каждой точке
 * 31 выборкой). rgb — средний цвет у левого и правого края (чуть внутрь), a — где по ширине левый край
 * (для карты материалов); a = 0 — на этой высоте флакона нет.
 */
const STRIP_H = 256;
function edgeStrip(img: HTMLImageElement, uv: THREE.Vector4) {
  const COLS = 32;
  const c = document.createElement("canvas");
  c.width = COLS;
  c.height = STRIP_H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  // тот же кадр, что и у проекции (uv — доля фото, занятая флаконом; ось Y у фото сверху вниз)
  const sx = uv.x * img.naturalWidth;
  const sw = uv.z * img.naturalWidth;
  const sh = uv.w * img.naturalHeight;
  const sy = (1 - uv.y - uv.w) * img.naturalHeight;
  g.filter = "blur(1.5px)";
  g.drawImage(img, sx, sy, sw, sh, 0, 0, COLS, STRIP_H);
  const d = g.getImageData(0, 0, COLS, STRIP_H).data;
  const out = new Uint8Array(STRIP_H * 4);
  for (let y = 0; y < STRIP_H; y++) {
    let L = -1;
    let R = -1;
    for (let x = 0; x < COLS; x++)
      if (d[(y * COLS + x) * 4 + 3] > 153) {
        if (L < 0) L = x;
        R = x;
      }
    const o = (STRIP_H - 1 - y) * 4; // в текстуре низ — первая строка
    if (L < 0) continue;
    const l1 = Math.min(L + 1, R);
    const r1 = Math.max(R - 1, L);
    const cols = [l1, Math.min(l1 + 1, R), r1, Math.max(r1 - 1, L)];
    for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round(cols.reduce((s, x) => s + d[(y * COLS + x) * 4 + ch], 0) / 4);
    out[o + 3] = Math.max(1, Math.round(((l1 + 1) / COLS) * 255));
  }
  const t = new THREE.DataTexture(out, 1, STRIP_H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Материал под стекло: физический, с пропусканием света (сколько именно — решает карта в шейдере) */
export function glassMaterial(src: THREE.Material, envMapIntensity: number, envMap?: THREE.Texture, refract = true) {
  const s = src as THREE.MeshStandardMaterial;
  return new THREE.MeshPhysicalMaterial({
    envMap: envMap ?? null,
    map: s.map,
    normalMap: s.normalMap,
    normalScale: s.normalScale,
    roughnessMap: s.roughnessMap,
    metalnessMap: s.metalnessMap,
    color: s.color,
    roughness: s.roughness,
    metalness: s.metalness,
    // преломление — дорогое (сцена считается ещё раз): без него стекло держится на бликах и цвете
    transmission: refract ? 1 : 0,
    thickness: 0.28,
    ior: 1.5,
    attenuationDistance: 1.2,
    attenuationColor: new THREE.Color("#fff6ea"),
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity,
  });
}

export type ProjectOptions = {
  /** объект, вместе с которым модель потом двигается (в витрине — её стойка на кольце) */
  frame?: THREE.Object3D;
  /** зеркальная копия для отражения в лаке: гаснет книзу */
  reflect?: boolean;
  /** карта материалов того же кадра, что фото: R — стекло, G — металл, B — шероховатое (бумага, мат, ткань) */
  mask?: THREE.Texture;
};

/**
 * Проецирует фото на лицевую сторону модели (после alignToPhoto). mix: 0 — как сгенерировано, 1 — с фото.
 * Проекция считается в системе координат frame, поэтому этикетка едет вместе с флаконом;
 * в момент вызова frame должен стоять в начале координат без поворота.
 * С картой материалов каждая точка получает свой материал: стекло пропускает и преломляет свет
 * (нужен glassMaterial), металл отражает, бумага матовая.
 */
export function projectPhoto(model: THREE.Object3D, img: HTMLImageElement, tex: THREE.Texture, opts: ProjectOptions = {}) {
  const { frame, reflect = false, mask } = opts;
  const { uv } = photoPixels(img);
  model.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(model, true);
  const box = new THREE.Vector4(b.min.x, b.min.y, b.max.x - b.min.x, b.max.y - b.min.y);
  // центр по глубине и половина глубины — чтобы понимать, насколько точка «спереди»
  const depth = new THREE.Vector2((b.min.z + b.max.z) / 2, (b.max.z - b.min.z) / 2);
  const mix = { value: 1 };
  const dim = { value: 1 };
  const toFrame = { value: new THREE.Matrix4() };
  const strip = edgeStrip(img, uv);

  // своя прозрачность у каждой точки: доля стекла из карты
  const transmission = THREE.ShaderChunk.transmission_fragment.replace(
    "material.transmission = transmission;",
    "material.transmission = transmission * glassM;",
  );

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // userData.alt — запасные материалы той же сетки (например, стекло с преломлением для крупного плана)
    const alt = (m.userData.alt as THREE.Material[] | undefined) ?? [];
    [...(Array.isArray(m.material) ? m.material : [m.material]), ...alt].forEach((mat) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFront = { value: tex };
        sh.uniforms.uMask = { value: mask ?? tex };
        sh.uniforms.uStrip = { value: strip };
        sh.uniforms.uHasMask = { value: mask ? 1 : 0 };
        sh.uniforms.uBox = { value: box };
        sh.uniforms.uUv = { value: uv };
        sh.uniforms.uMix = mix;
        sh.uniforms.uDim = dim;
        sh.uniforms.uToFrame = toFrame;
        sh.uniforms.uReflect = { value: reflect ? 1 : 0 };
        sh.uniforms.uDepth = { value: depth };
        sh.uniforms.uTexH = { value: img.naturalHeight * uv.w };
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nuniform mat4 uToFrame;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvWPos = (uToFrame * modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(uToFrame) * mat3(modelMatrix) * objectNormal);",
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <common>",
            [
              "#include <common>",
              "uniform sampler2D uFront;",
              "uniform sampler2D uMask;",
              "uniform sampler2D uStrip;",
              "uniform float uHasMask;",
              "uniform vec4 uBox;",
              "uniform vec4 uUv;",
              "uniform float uMix;",
              "uniform float uDim;",
              "uniform float uReflect;",
              "uniform vec2 uDepth;",
              "uniform float uTexH;",
              "varying vec3 vWPos;",
              "varying vec3 vWNrm;",
            ].join("\n"),
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec2 fb = clamp(vec2((vWPos.x - uBox.x) / uBox.z, (vWPos.y - uBox.y) / uBox.w), 0.0, 1.0);
            vec3 wn = normalize(vWNrm);
            // спереди — чёткое фото на всю переднюю половину флакона (так и снимает камера анфас: к краям
            // фото сжимается). Решаем по положению, а не по наклону: у выдуманных букв и трубки, вылепленных
            // в самой модели, стенки смотрят вбок — по наклону там проступала бы каша
            float q = (vWPos.z - uDepth.x) / max(uDepth.y, 1e-4);
            float wf = max(smoothstep(0.3, 0.6, wn.z), smoothstep(-0.1, 0.15, q)) * uMix;
            // резкость фото выбираем по высоте флакона на экране: на рёбрах вылепленной трубки/букв
            // автоматический выбор взял бы самый размытый уровень, и там выпадали бы буквы
            float dy = max(abs(dFdx(fb.y)), abs(dFdy(fb.y)));
            float lod = max(0.0, log2(dy * uTexH));
            vec2 fuv = uUv.xy + fb * uUv.zw;
            vec4 pf = textureLod(uFront, fuv, lod);
            float photoW = wf * pf.a;
            // бока и спина — цвет КРАЯ флакона на этой высоте (стекло, жидкость, крышка), а не этикетки:
            // этикетка не «оборачивается» вокруг флакона, и никакие буквы — ни свои, ни выдуманные — не проступают.
            // Цвет края посчитан заранее для каждой высоты (полоска uStrip: rgb — цвет, a — где край по ширине)
            vec4 st = texture2D(uStrip, vec2(0.5, fb.y));
            vec3 band = st.rgb;
            float ba = step(0.002, st.a);
            vec2 edgeUv = ba > 0.5 ? uUv.xy + vec2(st.a, fb.y) * uUv.zw : fuv;
            float restW = (1.0 - wf) * uMix * ba;
            diffuseColor.rgb = mix(diffuseColor.rgb, band * 0.78, restW);
            diffuseColor.rgb = mix(diffuseColor.rgb, pf.rgb, photoW);
            float cleanW = max(photoW, restW);
            // материал точки: спереди — из карты в той же точке, на боках и сзади — с края флакона
            vec3 mk = mix(texture2D(uMask, edgeUv).rgb, texture2D(uMask, fuv).rgb, wf) * uHasMask * cleanW;
            float glassM = mk.r;
            float metalM = mk.g;
            float roughM = mk.b;`,
          )
          .replace(
            "#include <metalnessmap_fragment>",
            // буквы-каша сидят и в картах металла/шероховатости: там, где фото, ставим свои значения
            `#include <metalnessmap_fragment>
            metalnessFactor = mix(metalnessFactor, 0.0, cleanW);
            roughnessFactor = mix(roughnessFactor, 0.14, cleanW);
            if (uHasMask > 0.5) {
              // стекло и лак — зеркально гладкие, металл — чуть мягче, бумага и мат — шероховатые
              roughnessFactor = mix(roughnessFactor, 0.035, cleanW * clamp(1.0 - metalM - roughM, 0.0, 1.0));
              metalnessFactor = mix(metalnessFactor, 1.0, metalM);
              roughnessFactor = mix(roughnessFactor, 0.2, metalM);
              roughnessFactor = mix(roughnessFactor, 0.62, roughM);
            }`,
          )
          .replace(
            "#include <normal_fragment_maps>",
            // ...и в карте рельефа
            "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, cleanW));",
          )
          .replace(
            "#include <lights_physical_fragment>",
            // лаковый слой есть у стекла и лака, но не у бумаги и не у металла
            "#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - clamp(roughM + metalM, 0.0, 1.0);\n#endif",
          )
          .replace("#include <transmission_fragment>", transmission)
          .replace(
            "#include <opaque_fragment>",
            `#include <opaque_fragment>
            // на фото свет уже есть: на бумаге и непрозрачных частях почти не пересвечиваем его светом сцены
            // (иначе проступает рельеф выдуманных букв); стекло же — честное: блики, отражения, преломление
            gl_FragColor.rgb = mix(gl_FragColor.rgb, pf.rgb, photoW * mix(0.85, 0.4, glassM) * mix(1.0, 0.45, metalM));
            // затемнение: дальние флаконы на кольце и все остальные, когда выбран один
            gl_FragColor.rgb *= uDim;
            // отражение в лаке гаснет книзу (у зеркальной копии)
            gl_FragColor.a *= mix(1.0, 1.0 - smoothstep(0.0, 0.34, fb.y), uReflect);`,
          );
      };
      // в сгенерированных моделях попадаются треугольники «наизнанку» (по вылепленной трубке/буквам):
      // с отсечением задних граней там была бы щель, сквозь которую видна задняя стенка — и буквы рвутся
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    });
  });

  return {
    setMix(v: number) {
      mix.value = v;
    },
    setDim(v: number) {
      dim.value = v;
    },
    /** каждый кадр, если frame двигается */
    update() {
      if (frame) toFrame.value.copy(frame.matrixWorld).invert();
    },
  };
}
