import * as THREE from "three";

/**
 * Настоящая этикетка на сгенерированной 3D-модели.
 * Image-to-3D хорошо угадывает форму и материал флакона, но надписи выходят кашей.
 * Поэтому: 1) находим, какой стороной модель смотрит «как на фото» (перебор поворотов
 * и сравнение с фото), 2) проецируем фото спереди на лицевую сторону, а сзади кладём
 * сильно размытое фото — цвет стекла без выдуманных зеркальных букв. Бока остаются от модели.
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

/** Проецирует фото на лицевую сторону модели (после alignToPhoto). mix: 0 — как сгенерировано, 1 — с фото */
export function projectPhoto(model: THREE.Object3D, img: HTMLImageElement, tex: THREE.Texture) {
  const { uv } = photoPixels(img);
  model.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(model, true);
  const box = new THREE.Vector4(b.min.x, b.min.y, b.max.x - b.min.x, b.max.y - b.min.y);
  const mix = { value: 1 };
  const shaders: { uniforms: Record<string, THREE.IUniform> }[] = [];

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFront = { value: tex };
        sh.uniforms.uBox = { value: box };
        sh.uniforms.uUv = { value: uv };
        sh.uniforms.uMix = mix;
        shaders.push(sh);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);",
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler2D uFront;\nuniform vec4 uBox;\nuniform vec4 uUv;\nuniform float uMix;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;",
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec2 fb = clamp(vec2((vWPos.x - uBox.x) / uBox.z, (vWPos.y - uBox.y) / uBox.w), 0.0, 1.0);
            vec3 wn = normalize(vWNrm);
            // спереди — чёткое фото
            float wf = smoothstep(0.3, 0.6, wn.z) * uMix;
            vec4 pf = texture2D(uFront, uUv.xy + fb * uUv.zw);
            float photoW = wf * pf.a;
            // бока и спина — средний цвет флакона на этой высоте (стекло, жидкость, крышка):
            // усредняем фото поперёк, так что никакие буквы — ни свои, ни выдуманные — не проступают
            // берём преобладающий цвет (медиана по яркости), чтобы тонкие золотые буквы не давали полос
            vec4 smp[9];
            float lum[9];
            float ba = 0.0;
            for (int k = 0; k < 9; k++) {
              smp[k] = texture2D(uFront, uUv.xy + vec2(0.1 + 0.1 * float(k), fb.y) * uUv.zw, 3.0);
              lum[k] = dot(smp[k].rgb, vec3(0.299, 0.587, 0.114)) + (1.0 - smp[k].a) * 10.0;
              ba += smp[k].a;
            }
            ba /= 9.0;
            vec3 band = vec3(0.0);
            float bn = 0.0;
            for (int i = 0; i < 9; i++) {
              int below = 0;
              for (int j = 0; j < 9; j++) below += lum[j] < lum[i] ? 1 : 0;
              if (below >= 2 && below <= 5) { band += smp[i].rgb; bn += 1.0; }
            }
            band /= max(bn, 1.0);
            float restW = (1.0 - wf) * uMix * smoothstep(0.25, 0.6, ba);
            diffuseColor.rgb = mix(diffuseColor.rgb, band * 0.78, restW);
            diffuseColor.rgb = mix(diffuseColor.rgb, pf.rgb, photoW);
            float cleanW = max(photoW, restW);`,
          )
          .replace(
            "#include <metalnessmap_fragment>",
            // буквы-каша сидят и в картах металла/шероховатости: там, где фото, делаем гладкое стекло
            "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, cleanW);\nroughnessFactor = mix(roughnessFactor, 0.14, cleanW);",
          )
          .replace(
            "#include <normal_fragment_maps>",
            // ...и в карте рельефа
            "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, cleanW));",
          );
      };
      mat.needsUpdate = true;
    });
  });

  return {
    setMix(v: number) {
      mix.value = v;
    },
  };
}
