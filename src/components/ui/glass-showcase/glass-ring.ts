import * as THREE from "three";
import { buildBottle, HT, softboxEnv, type Bottle3DSpec } from "./bottle3d";
import { buildPhotoBottle } from "./photo-bottle";
import { LivingRing } from "./living-ring";
import { getTheme, onTheme } from "@/lib/theme";
import type { PhotoBottleData } from "@/data/photo-bottles";

/** флакон витрины: стеклянный 3D (Bottle3DSpec) или фото-флакон с листа снимков */
export type RingSpec = Bottle3DSpec | { photo: PhotoBottleData };
type RingBottle = {
  scene: THREE.Scene;
  state: { ttx: number; ttz: number; yaw: number };
  step(dt: number): void;
  energy(): number;
  dispose(): void;
};
const widthOf = (s: RingSpec) =>
  "photo" in s ? ((Math.max(...s.photo.rows.map((r) => r[1])) * 2) / s.photo.size[1]) * HT : s.shape.aspect * HT;
/** половина глубины флакона (от ряда кольца к воде по радиусу) */
const depthOf = (s: RingSpec) =>
  "photo" in s ? (Math.max(...s.photo.rows.map((r) => r[2])) / s.photo.size[1]) * HT : (s.shape.aspect * HT * (s.shape.body.depth ?? 0.6)) / 2;

/**
 * Круглая витрина на фотореалистичных стеклянных флаконах (Three.js).
 * Флаконы стоят по кругу в «живом» кольце воды (см. living-ring.ts) лицом наружу; кольцо крутят пальцем/мышью с инерцией.
 * Когда кольцо разгоняется, флаконы чуть кренятся и жидкость в них раскачивается, потом успокаивается.
 * Выбор флакона — кольцо доворачивает его к зрителю, камера подъезжает.
 * Пока кольцо трогают — до 60 кадров в секунду; в покое вода живёт в ~30 кадрах (на телефоне ~24);
 * вне экрана и на скрытой вкладке — ни одного кадра. При «уменьшить движение» в покое кадров нет.
 * Тот же интерфейс, что у PerfumeRing: select, turn, dispose + события.
 */

export type GlassRingEvents = {
  onFront: (i: number) => void;
  onPick: (i: number) => void;
  onEmpty: () => void;
  onReady: () => void;
  /** кадры не успевают — пора на лёгкий режим (вызывается один раз) */
  onSlow?: () => void;
};

const BG = new THREE.Color("#f5f1ea");
const FOV = 30;

export class GlassRing {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  // spin — свой поворот флакона (крутят в крупном плане), spinV — его инерция; spread — насколько отодвинут в сторону
  private bottles: { b: RingBottle; g: THREE.Group; box: THREE.Box3; spin: number; spinV: number; spread: number; lift: number; landed: boolean; under: { o: THREE.Object3D; y: number; m: THREE.Material | null; op: number }[] }[] = [];
  /** появление: флаконы по очереди спускаются сверху в воду (−1 — ещё не началось) */
  private introT = -1;
  private spinning = false; // тянут открытый флакон, а не кольцо
  private env: THREE.Texture;
  private R: number;
  private step: number;
  private n: number;
  /** мест на кольце: не меньше трёх — при двух флаконах второй иначе стоит точно за первым */
  private slots: number;
  /** масштаб флаконов на кольце: при многих флаконах — меньше, чтобы им было просторно */
  private S: number;
  private extra: { dispose(): void }[] = [];
  private living: LivingRing;
  /** вода живёт и в покое (нет «уменьшить движение») */
  private alive: boolean;
  private touch: boolean;
  private calm = false;
  private wakeT = 0;
  private wakeI = 0;
  private dropT = 2;
  private spinT = 0;
  private dropAt = -1;
  private hoverI: number | null = null;
  private stirAt: { x: number; z: number; t: number } | null = null;
  private hitP = new THREE.Vector3();
  private offTheme: () => void;
  private ema = 16;
  private busyFrames = 0;
  private slowSent = false;
  /** чёткие листы снимков: грузятся только для флакона в крупном плане и того, на который смотрим изнутри */
  private hd = new Map<number, { tex: THREE.Texture | null; used: number }>();
  private hdSrc = new Map<number, { url: string; pb: { setPic(t: THREE.Texture): void; pic: THREE.Texture } }>();
  private loader = new THREE.TextureLoader();
  /** раскрытие витрины прокруткой: цель (от ScrollTrigger) и плавное текущее значение, 0 … 1 */
  private unfoldT = 0;
  private unfold = 0;
  /** кольцо остановлено на время «внутрь витрины»; psi — куда смотрит камера из центра */
  private frozen = false;
  private psi = Math.PI;
  private q = new THREE.Vector3();
  private cp = new THREE.Vector3();

  private ring = 0;
  private vel = 0;
  private target: number | null = null;
  private front = -1;
  private sel: number | null = null;
  private focus = 0;
  private portrait = false;
  private base = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private near = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private look = new THREE.Vector3();

  private down = false;
  private dragging = false;
  private startX = 0;
  private prevX = 0;
  private prevT = 0;
  private hover: { i: number; px: number; py: number } | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private force = true;
  private visible = true;
  private disposed = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  /**
   * lite — слабая видеокарта или телефон: меньше пикселей (бюджет ~2.2 Мп против ~4.5 Мп), без сглаживания на ПК,
   * отражение в воде мельче, в покое ~24 кадра. Внешне почти то же, а нагрузка в разы меньше.
   */
  constructor(
    private host: HTMLElement,
    specs: RingSpec[],
    private ev: GlassRingEvents,
    base = "",
    private lite = false,
  ) {
    this.n = specs.length;
    this.slots = Math.max(3, this.n);
    this.S = this.n > 3 ? 0.68 : 1;
    this.step = (Math.PI * 2) / this.slots;
    const touch = (this.touch = window.matchMedia("(pointer: coarse)").matches);
    this.alive = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // сглаживание краёв и на телефоне: мобильные видеокарты делают его почти бесплатно, а без него флаконы «рваные»
    // сглаживание: на мобильных видеокартах почти бесплатно; на слабой видеокарте ПК (большой экран) — дорого
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !lite || touch, alpha: true, powerPreference: "high-performance" }));
    r.setClearColor(0x000000, 0); // прозрачный — за витриной виден фон страницы (сетка)
    // на телефоне кольцо по ширине экрана и флаконы мелкие — рисуем в 2× (было 1.5×, выходило мыльно)
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 2 : 1.75));
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    const cv = r.domElement;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Круглая витрина ароматов в стекле: потяните в сторону, чтобы повернуть, нажмите на флакон, чтобы открыть");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;outline:none";
    host.appendChild(cv);

    this.env = softboxEnv(r);
    this.scene.environment = this.env;

    // флаконы по кругу: радиус — чтобы соседние не касались
    const sizes = specs.map(widthOf);
    const maxW = Math.max(...sizes);
    const avgW = sizes.reduce((x, y) => x + y, 0) / sizes.length;
    // мало флаконов — просторно; много — по средней ширине, чтобы кольцо не разрасталось из-за самых широких
    const gap = this.n <= 3 ? maxW * 1.6 : avgW * 1.3;
    this.R = Math.max(maxW * 1.05, gap / (2 * Math.sin(this.step / 2)));
    // канал воды: флаконы стоят посередине, по бокам — место для лепестков
    const dh = Math.max(...specs.map(depthOf)) * this.S;
    this.living = new LivingRing({ R: this.R, half: dh + Math.max(0.75, HT * this.S * 0.22), dh, touch, env: this.env });
    this.scene.add(this.living.group);
    // тема: подиум и вода перекрашиваются плавно
    this.living.setDark(getTheme() === "dark", true);
    this.offTheme = onTheme(() => {
      this.living.setDark(getTheme() === "dark");
      this.force = true;
      this.loop();
    });

    const loader = new THREE.TextureLoader();
    let pending = specs.reduce((n, s) => n + ("photo" in s ? 2 : (s.label ? 1 : 0) + (s.photoCap ? 1 : 0)), 0);
    const done = () => {
      if (--pending === 0) {
        this.ev.onReady();
        if (this.introT < 0) this.introT = 0;
      }
      this.force = true;
      this.loop();
    };
    if (!pending)
      queueMicrotask(() => {
        this.ev.onReady();
        this.introT = 0;
        this.loop();
      });
    const tload = (url: string, srgb: boolean) => {
      const t = loader.load(`${base}${url}`, done, undefined, done);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.extra.push(t);
      return t;
    };
    specs.forEach((spec) => {
      if ("photo" in spec) {
        const pb = buildPhotoBottle(spec.photo, HT, tload(spec.photo.sheet, true), tload(spec.photo.glass, false));
        this.hdSrc.set(this.bottles.length, { url: `${base}/sheets-hd/${spec.photo.slug}.webp`, pb });
        const g = new THREE.Group();
        g.scale.setScalar(this.S);
        [...pb.scene.children].forEach((c) => g.add(c));
        this.scene.add(g);
        this.living.mirror(g);
        this.bottles.push({ b: pb, g, box: new THREE.Box3(), spin: 0, spinV: 0, spread: 0, lift: 0, landed: false, under: this.underOf(g) });
        return;
      }
      let tex: THREE.Texture | undefined;
      if (spec.label) {
        tex = loader.load(`${base}${spec.label}`, done, undefined, done);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        this.extra.push(tex);
      }
      let capTex: THREE.Texture | undefined;
      if (spec.photoCap) {
        capTex = loader.load(`${base}${spec.photoCap.src}`, done, undefined, done);
        capTex.colorSpace = THREE.SRGBColorSpace;
        capTex.anisotropy = 8;
        this.extra.push(capTex);
      }
      const b = buildBottle(spec, BG, this.env, tex, capTex);
      b.state.yaw = 0;
      b.step(0.016);
      // всё содержимое сцены флакона (флакон, тень, каустика) — в одну группу на кольце
      const g = new THREE.Group();
      g.scale.setScalar(this.S);
      [...b.scene.children].forEach((c) => g.add(c));
      this.scene.add(g);
      this.living.mirror(g);
      this.bottles.push({ b, g, box: new THREE.Box3(), spin: 0, spinV: 0, spread: 0, lift: 0, landed: false, under: this.underOf(g) });
    });

    // «уменьшить движение» — флаконы сразу на местах
    if (!this.alive) this.bottles.forEach((x) => (x.landed = true));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) {
        this.force = true;
        this.loop();
      }
    });
    this.io.observe(host);
    cv.addEventListener("pointerdown", this.onDown);
    cv.addEventListener("pointermove", this.onMove);
    cv.addEventListener("pointerup", this.onUp);
    cv.addEventListener("pointercancel", this.onCancel);
    cv.addEventListener("pointerleave", this.onLeave);
    this.resize();
  }

  /** тень и блик под флаконом — остаются на воде, пока сам флакон спускается */
  private underOf(g: THREE.Group) {
    return g.children.slice(1).map((o) => {
      const m = (o as THREE.Mesh).material;
      const mat = m && !Array.isArray(m) ? (m as THREE.Material) : null;
      return { o, y: o.position.y, m: mat, op: mat ? mat.opacity : 1 };
    });
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    // узкий экран (телефон, узкое окно): кольцо целиком по ширине, флаконы мелкие — рисуем вдвое плотнее
    // и даём браузеру ужать: края гладкие, мелкие детали чище. На широком хватает плотности экрана (до 1.75×).
    const dpr = window.devicePixelRatio || 1;
    const want = w < 760 ? 2 : Math.min(dpr, this.touch ? 2 : 1.75);
    // бюджет пикселей: на большом экране со слабой видеокартой не рисуем 4–11 Мп за кадр
    const budget = (this.lite ? 2.2 : 4.5) * 1e6;
    this.renderer.setPixelRatio(Math.max(0.75, Math.min(want, Math.sqrt(budget / (w * h)))));
    this.renderer.setSize(w, h, false);
    this.living.setSize(this.renderer.domElement.width, this.renderer.domElement.height, this.lite ? 0.33 : 0.5);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.portrait = aspect < 0.85;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const span = this.R + HT * 0.45;
    if (this.portrait && this.n > 3) {
      // телефон: всё кольцо целиком, тот же вид, что на компьютере, — по ширине экрана с небольшим полем
      const ro = this.living.ro + 0.3;
      const p = new THREE.Vector3();
      let dist = (HT * 1.35) / t;
      for (let k = 0; k < 120; k++) {
        this.camera.position.set(0, HT * 0.5 + dist * 0.22, dist);
        this.camera.lookAt(0, HT * 0.3, 0);
        this.camera.updateMatrixWorld();
        let wide = 0;
        // край обода по кругу (ближние точки проецируются шире дальних)
        for (let j = 0; j < 24; j++) {
          const a = (j / 24) * Math.PI * 2;
          wide = Math.max(wide, Math.abs(p.set(Math.sin(a) * ro, 0, Math.cos(a) * ro).project(this.camera).x));
        }
        if (wide <= 0.96) break;
        dist *= 1.02;
      }
      this.base.pos.set(0, HT * 0.5 + dist * 0.22, dist);
      this.base.look.set(0, HT * 0.3, 0);
    } else {
      let dist = Math.max(span / (t * aspect) + this.R * 0.5, (HT * 1.35) / t);
      // широкий экран: отодвигаем камеру, пока передний флакон не окажется выше подписи внизу
      const front = new THREE.Vector3();
      for (let k = 0; k < 40; k++) {
        this.camera.position.set(0, HT * 0.5 + dist * 0.22, dist);
        this.camera.lookAt(0, HT * 0.3, 0);
        this.camera.updateMatrixWorld();
        if (front.set(0, 0, this.R + HT * 0.1).project(this.camera).y >= -0.5) break;
        dist *= 1.04;
      }
      this.base.pos.set(0, HT * 0.5 + dist * 0.22, dist);
      this.base.look.set(0, HT * 0.3, 0);
    }
    // крупный план: флакон слева от карточки (компьютер) или над ней (телефон)
    const bh = HT * this.S; // высота флакона на кольце
    if (this.portrait) {
      // телефон: карточка занимает нижнюю половину экрана — флакон целиком в верхней части,
      // между шапкой (верх ≈ +0.74) и карточкой (низ флакона ≈ +0.08)
      let nd = bh * 5;
      let ly = bh * 0.2;
      const top = new THREE.Vector3();
      const foot = new THREE.Vector3();
      for (let k = 0; k < 8; k++) {
        this.camera.position.set(0, bh * 0.55, this.R + nd);
        this.camera.lookAt(0, ly, this.R);
        this.camera.updateMatrixWorld();
        const yt = top.set(0, bh * 1.02, this.R).project(this.camera).y;
        const yb = foot.set(0, 0, this.R).project(this.camera).y;
        nd *= (yt - yb) / 0.66;
        ly += ((yt + yb) / 2 - 0.41) * nd * t;
      }
      this.near.pos.set(0, bh * 0.55, this.R + nd);
      this.near.look.set(0, ly, this.R);
    } else {
      const nd = bh * 2.3;
      const shift = bh * 0.32;
      this.near.pos.set(shift, bh * 0.6, this.R + nd);
      this.near.look.set(shift, bh * 0.46, this.R);
    }
    this.force = true;
    this.loop();
  }

  // ───────────────────────── снаружи

  select(i: number | null) {
    this.sel = i;
    this.vel = 0;
    if (i === null) {
      this.target = null;
    } else {
      const want = -i * this.step;
      this.target = want + Math.PI * 2 * Math.round((this.ring - want) / (Math.PI * 2));
      // флакон доехал вперёд — от него по воде расходится круг
      this.dropAt = this.living.time + 0.75;
    }
    this.loop();
  }

  /**
   * Прогресс прокрутки 0 … 1 (ScrollTrigger, scrub): 0 — овал сверху; дальше камера опускается в центр кольца,
   * флаконы поворачиваются к ней лицом, и прокрутка ведёт взгляд по кругу; обратно — тот же путь до овала.
   */
  setUnfold(p: number) {
    this.unfoldT = Math.min(1, Math.max(0, p));
    if (this.unfoldT > 0.001 && this.sel !== null) this.ev.onEmpty();
    this.loop();
  }

  turn(d: number) {
    if (this.sel !== null || this.unfold > 0.001) return;
    const from = this.target ?? this.ring;
    let t = Math.round(from / this.step) * this.step - d * this.step;
    // пустые места кольца пропускаем
    for (let k = 0; k < this.slots && this.slotAt(t) >= this.n; k++) t -= d * this.step;
    this.target = t;
    this.vel = 0;
    this.loop();
  }

  private slotAt(ring: number) {
    return ((Math.round(-ring / this.step) % this.slots) + this.slots) % this.slots;
  }

  /** чёткий лист для флакона i (и не больше 6 таких сразу — память видеокарты на телефоне) */
  private wantHD(i: number) {
    const src = this.hdSrc.get(i);
    if (!src) return;
    const have = this.hd.get(i);
    if (have) {
      have.used = performance.now();
      return;
    }
    const rec = { tex: null as THREE.Texture | null, used: performance.now() };
    this.hd.set(i, rec);
    this.loader.load(src.url, (t) => {
      if (this.disposed || this.hd.get(i) !== rec) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      rec.tex = t;
      src.pb.setPic(t);
      this.force = true;
      this.loop();
    });
    if (this.hd.size > 6) {
      // самый давно не нужный — обратно на обычный лист
      let old = -1;
      let t0 = Infinity;
      this.hd.forEach((r, k) => {
        if (k !== i && r.used < t0) {
          t0 = r.used;
          old = k;
        }
      });
      const r = this.hd.get(old);
      if (r) {
        this.hdSrc.get(old)?.pb.setPic(this.hdSrc.get(old)!.pb.pic);
        r.tex?.dispose();
        this.hd.delete(old);
      }
    }
  }

  // ───────────────────────── указатель

  private pick(e: PointerEvent): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    let best: number | null = null;
    let bestD = Infinity;
    const hit = new THREE.Vector3();
    this.bottles.forEach((x, i) => {
      if (this.ray.ray.intersectBox(x.box, hit)) {
        const d = hit.distanceTo(this.ray.ray.origin);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    return best;
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.down = true;
    this.dragging = false;
    this.startX = this.prevX = e.clientX;
    this.prevT = performance.now();
    this.vel = 0;
    // касание воды мимо флаконов — круг
    if (this.pick(e) === null) {
      const w = this.living.hit(this.ray.ray, this.hitP);
      if (w) this.living.ripple(w.x, w.z, 0.9);
    }
    this.loop();
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) {
      if (!this.dragging && Math.abs(e.clientX - this.startX) > 7 && this.unfold < 0.001) {
        this.dragging = true;
        this.spinning = this.sel !== null;
        if (!this.spinning) this.target = null;
        this.renderer.domElement.setPointerCapture(e.pointerId);
        this.renderer.domElement.style.cursor = "grabbing";
      }
      if (this.dragging) {
        const now = performance.now();
        const dt = Math.max(8, now - this.prevT) / 1000;
        if (this.spinning && this.sel !== null) {
          // крутим открытый флакон вокруг своей оси
          const x = this.bottles[this.sel];
          const da = ((e.clientX - this.prevX) / this.host.clientWidth) * Math.PI * (this.portrait ? 3 : 2.4);
          x.spin += da;
          x.spinV = x.spinV * 0.6 + (da / dt) * 0.4;
        } else {
          const da = ((e.clientX - this.prevX) / this.host.clientWidth) * Math.PI * (this.portrait ? 2.2 : 1.5);
          this.ring += da;
          this.vel = this.vel * 0.6 + (da / dt) * 0.4;
        }
        this.prevX = e.clientX;
        this.prevT = now;
        this.loop();
      }
      return;
    }
    if (e.pointerType === "touch") return;
    // наведение: флакон под курсором чуть наклоняется к нему, жидкость качается
    const i = this.pick(e);
    const r = this.renderer.domElement.getBoundingClientRect();
    this.hover = i === null ? null : { i, px: ((e.clientX - r.left) / r.width - 0.5) * 2, py: ((e.clientY - r.top) / r.height - 0.5) * 2 };
    // навели на новый флакон — у его основания дрогнула вода
    if (i !== null && i !== this.hoverI && this.sel === null) {
      const p = this.bottles[i].g.position;
      this.living.ripple(p.x, p.z, 0.45);
    }
    this.hoverI = i;
    // мышь скользит над водой — за ней круги, лепестки отплывают
    const w = i === null ? this.living.hit(this.ray.ray, this.hitP) : null;
    if (w) {
      const t = this.living.time;
      const s = this.stirAt;
      const d = s ? Math.hypot(w.x - s.x, w.z - s.z) : 1;
      if (d > 0.32 || (s && t - s.t > 0.4 && d > 0.05)) {
        const dt = s ? Math.max(0.03, t - s.t) : 1;
        if (s) this.living.push(w.x, w.z, (w.x - s.x) / dt, (w.z - s.z) / dt);
        this.living.ripple(w.x, w.z, Math.min(0.7, 0.25 + d * 0.5));
        this.stirAt = { x: w.x, z: w.z, t };
      }
    } else this.stirAt = null;
    this.renderer.domElement.style.cursor = i !== null && i === this.sel ? "grab" : i !== null ? "pointer" : "grab";
    this.loop();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    this.down = false;
    if (this.dragging) {
      this.dragging = false;
      this.renderer.domElement.style.cursor = "grab";
      if (this.spinning) {
        this.spinning = false;
        this.loop();
        return;
      }
      if (Math.abs(this.vel) < 0.35) this.target = this.snap(this.ring);
      this.loop();
      return;
    }
    // раскрытая дуга — только для просмотра прокруткой; выбор флакона — в овале
    if (this.unfold > 0.02) return;
    const i = this.pick(e);
    if (i !== null) this.ev.onPick(i);
    else this.ev.onEmpty();
  };

  /** ближайшее занятое место кольца */
  private snap(ring: number) {
    let best = Math.round(ring / this.step) * this.step;
    let d = Infinity;
    for (let k = -this.slots; k <= this.slots; k++) {
      const t = (Math.round(ring / this.step) + k) * this.step;
      if (this.slotAt(t) < this.n && Math.abs(t - ring) < d) {
        d = Math.abs(t - ring);
        best = t;
      }
    }
    return best;
  }

  private onCancel = () => {
    this.down = false;
    this.dragging = false;
    this.spinning = false;
  };

  private onLeave = () => {
    this.hover = null;
    this.hoverI = null;
    this.stirAt = null;
    this.loop();
  };

  // ───────────────────────── кадр

  private loop() {
    if (this.raf || !this.visible || this.disposed) return;
    const tick = (t: number) => {
      this.raf = 0;
      if (!this.visible || this.disposed) return;
      // в покое вода живёт реже: ~30 кадров (телефон ~24)
      const gap = this.calm ? (this.touch || this.lite ? 42 : 32) : 15.5;
      if (this.last && t - this.lastDraw < gap) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.033, this.last ? (t - this.last) / 1000 : 0.016);
      // следим, успевают ли кадры, пока что-то движется: стабильно реже ~28 к/с — просим лёгкий режим
      if (!this.calm && this.last && !this.lite && !this.slowSent) {
        this.ema += (t - this.last - this.ema) * 0.05;
        if (++this.busyFrames > 150 && this.ema > 36) {
          this.slowSent = true;
          this.ev.onSlow?.();
        }
      }
      this.last = t;
      this.lastDraw = t;
      const busy = this.frame(dt);
      this.calm = !busy;
      if (busy || this.alive) this.raf = requestAnimationFrame(tick);
      else this.last = 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number): boolean {
    const damp = (k: number) => 1 - Math.exp(-dt * k);
    let moving = this.down || this.force;
    this.force = false;

    // «внутрь витрины»: мягко догоняем прогресс прокрутки (scrub); кольцо на это время стоит на месте
    const lv = this.living;
    const u0 = this.unfold;
    this.unfold += (this.unfoldT - this.unfold) * damp(14);
    if (Math.abs(this.unfoldT - this.unfold) < 1e-4) this.unfold = this.unfoldT;
    if (this.unfold !== u0) moving = true;
    if (this.unfold > 0 && !this.frozen) {
      // ставим ближайший флакон точно вперёд — тогда точно напротив, на дальней стороне, тоже флакон
      this.frozen = true;
      this.vel = 0;
      this.target = this.snap(this.target ?? this.ring);
    }
    if (this.unfold === 0) this.frozen = false;
    const pu = this.unfold;
    const sm = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    // куда смотрим изнутри: сначала на дальний флакон, потом прокрутка ведёт взгляд по кругу почти на полный оборот
    // равномерно: флакон k — точно при прогрессе 0.3 + 0.7·k/(n−1) (на эти точки доводит прокрутка)
    this.psi = Math.PI + Math.PI * 2 * (1 - 1 / this.n) * Math.min(1, Math.max(0, (pu - 0.3) / 0.7));

    // кольцо: доводка к цели или инерция
    const prevRing = this.ring;
    if (!this.dragging || this.spinning) {
      if (this.target !== null) {
        const d = this.target - this.ring;
        this.ring += d * damp(this.sel !== null ? 3.4 : 6);
        if (Math.abs(d) < 1e-4) {
          this.ring = this.target;
          if (this.sel === null) this.target = null;
        } else moving = true;
      } else {
        this.ring += this.vel * dt;
        this.vel *= Math.exp(-dt * 2.4);
        if (Math.abs(this.vel) > 0.01) moving = true;
        else {
          this.vel = 0;
          // остановились на пустом месте — доводим до ближайшего флакона
          if (this.slotAt(this.ring) >= this.n) {
            this.target = this.snap(this.ring);
            moving = true;
          }
        }
      }
    }
    const angVel = dt > 0 ? (this.ring - prevRing) / dt : 0;

    if (this.introT >= 0) this.introT += dt;
    const f0 = this.focus;
    this.focus += ((this.sel !== null ? 1 : 0) - this.focus) * damp(2.6);
    if (Math.abs(this.focus - f0) > 1e-4) moving = true;
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    this.camera.position.lerpVectors(this.base.pos, this.near.pos, f);
    this.look.lerpVectors(this.base.look, this.near.look, f);
    if (pu > 0) {
      // камера перелетает над передним рядом и опускается в центр кольца, к самой воде, глядя на дальний флакон;
      // дальше — стоит в центре и поворачивается вслед за прокруткой
      const bh = HT * this.S;
      const w = sm(0.02, 0.3, pu);
      const dx = Math.sin(this.psi);
      const dz = Math.cos(this.psi);
      this.cp.set(-dx * this.R * 0.32, bh * 0.55 + Math.sin(Math.PI * w) * bh * 1.1, -dz * this.R * 0.32);
      this.q.set(dx * this.R, bh * 0.45, dz * this.R);
      this.camera.position.lerp(this.cp, w);
      this.look.lerp(this.q, w);
    }
    this.camera.lookAt(this.look);

    // подпись внизу — флакон напротив зрителя; изнутри — тот, на который сейчас смотрим
    const front =
      pu > 0.25 ? ((Math.round((this.psi - this.ring) / this.step) % this.slots) + this.slots) % this.slots : this.slotAt(this.ring);
    // чёткие снимки: открытый флакон; изнутри витрины — тот, на который смотрим, и соседи
    if (this.sel !== null && this.focus > 0.3) this.wantHD(this.sel);
    if (pu > 0.2 && front < this.n) [0, 1, -1].forEach((d) => this.wantHD((front + d + this.n) % this.n));
    if (front < this.n && front !== this.front) {
      this.front = front;
      this.ev.onFront(front);
    }

    this.bottles.forEach((x, i) => {
      let a = i * this.step + this.ring;
      // в крупном плане соседи расходятся в стороны: ближние уходят из кадра, дальние — задний план
      // (плавно — при листании стрелками новый выбранный выезжает на место, прежний отходит)
      const want = this.sel !== null && this.sel !== i ? 1 : 0;
      x.spread += (want - x.spread) * damp(5);
      if (Math.abs(want - x.spread) > 1e-3) moving = true;
      if (x.spread * f > 1e-4) {
        const rel = Math.atan2(Math.sin(a), Math.cos(a));
        a += Math.sign(rel) * 0.55 * f * x.spread * (1 - Math.abs(rel) / Math.PI);
      }
      // свой поворот: открытый флакон крутят с инерцией; остальные плавно возвращаются лицом наружу
      const grabbed = this.spinning && this.sel === i;
      if (!grabbed) {
        if (this.sel === i && Math.abs(x.spinV) > 0.02) {
          x.spin += x.spinV * dt;
          x.spinV *= Math.exp(-dt * 2.2);
          moving = true;
        } else if (this.sel !== i && Math.abs(x.spin) > 1e-3) {
          x.spinV = 0;
          // к ближайшему «лицом наружу», не откручивая лишние обороты
          x.spin = Math.atan2(Math.sin(x.spin), Math.cos(x.spin));
          x.spin -= x.spin * damp(4);
          moving = true;
        } else if (this.sel !== i) x.spin = 0;
      }
      // появление: сверху вниз по очереди от переднего флакона, с плавным поворотом; в конце — мягко в воду
      let drop = 0;
      let twirl = 0;
      let show = 1; // проявление тени при появлении
      if (!x.landed) {
        const rank = Math.min(i, this.n - i);
        const t = this.introT < 0 ? 0 : Math.min(1, Math.max(0, (this.introT - 0.35 - rank * 0.085) / 1.5));
        const e = 1 - (1 - t) ** 3;
        drop = (1 - e) * 22;
        twirl = (1 - e) * Math.PI * 1.5 * (i % 2 ? 1 : -1);
        show = e * e;
        if (t >= 1) {
          x.landed = true;
          drop = 0;
          show = 1;
          // круг — у тех, что спереди (задних не видно, а кругов в запасе ограниченное число)
          if (Math.cos(a) > -0.3) {
            lv.place(a, 0, 0, this.q);
            lv.ripple(this.q.x, this.q.z, 0.85);
          }
        } else moving = true;
      }
      // флакон под мышкой приподнимается над водой (тень остаётся на воде и бледнеет)
      const wantLift = x.landed && this.hover?.i === i && this.sel === null && !this.down ? 1 : 0;
      x.lift += (wantLift - x.lift) * damp(wantLift ? 7 : 5);
      if (Math.abs(wantLift - x.lift) > 1e-3) moving = true;
      else x.lift = wantLift;
      const up = drop + x.lift * x.lift * (3 - 2 * x.lift) * HT * this.S * 0.1;
      for (const u of x.under) {
        u.o.position.y = u.y - up / this.S;
        if (u.m) u.m.opacity = u.op * show * (1 - 0.4 * x.lift);
      }
      // основание — своя точка подиума (на круге или на дуге), флакон вертикален и смотрит наружу
      // основание — своя точка подиума; изнутри флаконы плавно поворачиваются лицом к центру
      const th = lv.theta(a);
      lv.at(th, 0, up, x.g.position);
      x.g.rotation.y = th + x.spin + twirl + Math.PI * sm(0.1, 0.3, pu);
      const s = x.b.state;
      // крен от вращения кольца (флакон «отстаёт»), плюс наклон к курсору при наведении
      const h = this.hover && this.hover.i === i && this.sel === null ? this.hover : null;
      s.ttz = THREE.MathUtils.clamp(angVel * 0.05 + (this.sel === i ? x.spinV * 0.025 : 0), -0.16, 0.16) + (h ? -h.px * 0.12 : 0);
      s.ttx = h ? h.py * 0.06 : 0;
      if (x.b.energy() > 0.004) {
        x.b.step(dt);
        moving = true;
      }
      x.g.updateMatrixWorld(true);
      x.box.setFromObject(x.g.children[0]);
    });

    // вода: круги от вращения кольца, от открытого флакона, когда его крутят, и редкие «капли» в покое
    if (Math.abs(angVel) > 0.15) {
      this.wakeT += dt;
      if (this.wakeT > 0.09) {
        this.wakeT = 0;
        // по очереди от флаконов передней половины кольца
        for (let k = 0; k < this.n; k++) {
          this.wakeI = (this.wakeI + 7) % this.n;
          const p = this.bottles[this.wakeI].g.position;
          if (p.z > -this.R * 0.25) {
            lv.ripple(p.x, p.z, Math.min(0.9, Math.abs(angVel) * 0.45));
            break;
          }
        }
      }
    }
    if (this.sel !== null) {
      const x = this.bottles[this.sel];
      if (this.dropAt > 0 && lv.time >= this.dropAt) {
        this.dropAt = -1;
        lv.ripple(x.g.position.x, x.g.position.z, 1.3);
      }
      this.spinT += dt;
      if (Math.abs(x.spinV) > 0.8 && this.spinT > 0.2) {
        this.spinT = 0;
        lv.ripple(x.g.position.x, x.g.position.z, Math.min(0.7, Math.abs(x.spinV) * 0.12));
      }
    } else this.dropAt = -1;
    if (this.alive) {
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = 2.2 + Math.random() * 3.5;
        // там, куда смотрит камера: перёд овала или участок дуги
        const th = (pu > 0.25 ? this.psi : 0) + (Math.random() - 0.5) * (pu > 0.25 ? 0.8 : 2.4);
        const r = lv.ri + (lv.ro - lv.ri) * (Math.random() < 0.5 ? 0.15 + Math.random() * 0.15 : 0.7 + Math.random() * 0.15);
        lv.at(th, r - this.R, 0, this.q);
        lv.ripple(this.q.x, this.q.z, 0.3 + Math.random() * 0.3);
      }
    }
    if (lv.fading) moving = true;
    lv.update(dt, angVel);
    lv.renderReflection(this.renderer, this.camera);

    this.renderer.render(this.scene, this.camera);
    return moving;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    const cv = this.renderer.domElement;
    cv.removeEventListener("pointerdown", this.onDown);
    cv.removeEventListener("pointermove", this.onMove);
    cv.removeEventListener("pointerup", this.onUp);
    cv.removeEventListener("pointercancel", this.onCancel);
    cv.removeEventListener("pointerleave", this.onLeave);
    this.bottles.forEach((x) => x.b.dispose());
    this.living.dispose();
    this.hd.forEach((r) => r.tex?.dispose());
    this.offTheme();
    this.extra.forEach((x) => x.dispose());
    this.env.dispose();
    this.renderer.dispose();
    cv.remove();
  }
}
