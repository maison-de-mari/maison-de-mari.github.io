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

/**
 * Проецирует фото на лицевую сторону модели (после alignToPhoto). mix: 0 — как сгенерировано, 1 — с фото.
 * frame — объект, вместе с которым модель потом двигается (в витрине — её стойка на кольце):
 * проекция считается в его системе координат, поэтому этикетка едет вместе с флаконом.
 * В момент вызова frame должен стоять в начале координат без поворота.
 */
export function projectPhoto(
  model: THREE.Object3D,
  img: HTMLImageElement,
  tex: THREE.Texture,
  frame?: THREE.Object3D,
  /** зеркальная копия для отражения: гаснет книзу */
  reflect = false,
) {
  const { uv } = photoPixels(img);
  model.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(model, true);
  const box = new THREE.Vector4(b.min.x, b.min.y, b.max.x - b.min.x, b.max.y - b.min.y);
  // центр по глубине и половина глубины — чтобы понимать, насколько точка «спереди»
  const depth = new THREE.Vector2((b.min.z + b.max.z) / 2, (b.max.z - b.min.z) / 2);
  const mix = { value: 1 };
  const dim = { value: 1 };
  const toFrame = { value: new THREE.Matrix4() };
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
        sh.uniforms.uDim = dim;
        sh.uniforms.uToFrame = toFrame;
        sh.uniforms.uReflect = { value: reflect ? 1 : 0 };
        sh.uniforms.uDepth = { value: depth };
        sh.uniforms.uTexH = { value: img.naturalHeight * uv.w };
        shaders.push(sh);
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nuniform mat4 uToFrame;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvWPos = (uToFrame * modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(uToFrame) * mat3(modelMatrix) * objectNormal);",
          );
        sh.fragmentShader = sh.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler2D uFront;\nuniform vec4 uBox;\nuniform vec4 uUv;\nuniform float uMix;\nuniform float uDim;\nuniform float uReflect;\nuniform vec2 uDepth;\nuniform float uTexH;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;",
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
            vec4 pf = textureLod(uFront, uUv.xy + fb * uUv.zw, lod);
            float photoW = wf * pf.a;
            // бока и спина — цвет КРАЯ флакона на этой высоте (стекло, жидкость, крышка), а не этикетки:
            // этикетка не «оборачивается» вокруг флакона, и никакие буквы — ни свои, ни выдуманные — не проступают
            vec4 smp[31];
            int L = -1;
            int Rr = -1;
            for (int k = 0; k < 31; k++) {
              smp[k] = texture2D(uFront, uUv.xy + vec2((float(k) + 0.5) / 31.0, fb.y) * uUv.zw, 2.0);
              if (smp[k].a > 0.6) { if (L < 0) L = k; Rr = k; }
            }
            vec3 band = vec3(0.0);
            float ba = 0.0;
            if (L >= 0) {
              int l1 = min(L + 1, Rr);
              int r1 = max(Rr - 1, L);
              band = (smp[l1].rgb + smp[min(l1 + 1, Rr)].rgb + smp[r1].rgb + smp[max(r1 - 1, L)].rgb) * 0.25;
              ba = 1.0;
            }
            float restW = (1.0 - wf) * uMix * ba;
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
          )
          .replace(
            "#include <opaque_fragment>",
            `#include <opaque_fragment>
            // на фото свет уже есть: спереди почти не пересвечиваем его светом сцены,
            // иначе проступает рельеф выдуманных букв, вылепленных в самой модели
            gl_FragColor.rgb = mix(gl_FragColor.rgb, pf.rgb, photoW * 0.85);
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
