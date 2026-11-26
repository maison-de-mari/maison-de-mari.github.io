import * as THREE from "three";
import { buildSolid, type SolidSpec } from "./solid-bottle";

/**
 * Круглая витрина Maison De Mari на three.js.
 * Лакированный подиум-циферблат с золотым ободом; флаконы (вырезки на прозрачном фоне) стоят по кругу,
 * всегда смотрят в камеру и отражаются в лаке. Кольцо крутится пальцем/мышью с инерцией, само медленно
 * плывёт в простое. Выбор флакона — кольцо доворачивает его к зрителю, камера подъезжает, остальные гаснут.
 * Сцена ничего не знает о React: наружу — только события.
 */

export type RingEvents = {
  onFront: (i: number) => void;
  onHover: (i: number | null) => void;
  onPick: (i: number) => void;
  onEmpty: () => void;
  onReady: () => void;
};

const R = 4.4; // радиус круга флаконов
const H = 1.7; // высота флакона
const MAX_W = 1.05; // самый широкий флакон
const FOV = 32;
const GOLD = new THREE.Color("#c9a463");
const GOLD_LINE = new THREE.Color("#a98445");

const vert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform float uDim;
uniform float uOpacity;
uniform float uReflect;
varying vec2 vUv;
void main(){
  // флакон стоит лицом наружу кольца: со спины видим не зеркальную этикетку, а тёмный силуэт
  // (у отражения плоскость перевёрнута — у него «лицо» и «спина» меняются местами)
  bool front = uReflect > 0.5 ? !gl_FrontFacing : gl_FrontFacing;
  vec2 uv = front ? vUv : vec2(1.0 - vUv.x, vUv.y);
  vec4 c = texture2D(map, uv);
  float a = c.a * uOpacity;
  if (uReflect > 0.5) a *= (1.0 - smoothstep(0.0, 0.36, vUv.y)) * 0.24;
  vec3 col = c.rgb;
  if (!front) col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.5) * 0.3;
  // светлая тема: дальние и невыбранные флаконы не темнеют, а тают в светлой дымке
  vec3 haze = vec3(0.904, 0.863, 0.807);
  vec3 lit = uDim >= 1.0 ? col * uDim : mix(haze, col, uDim);
  gl_FragColor = vec4(lit, a);
  #include <colorspace_fragment>
}`;

function radial(stops: [number, string][], size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Окружение «предметной съёмки» для отражений на флаконах: тёмная студия, две высокие полосы
 * софтбоксов по бокам, мягкий верхний свет и тёплый контровой свет сзади. Яркость > 1 — это HDR,
 * PMREM её сохраняет, поэтому блики на стекле получаются яркими и чёткими.
 */
function studioScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: "#0b0806", side: THREE.BackSide }));
  s.add(room);
  const panel = (w: number, h: number, color: string, k: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  panel(0.7, 6, "#ffffff", 5, [-3.2, 0.5, 2.6], [0, 0.5, 0]); // левый софтбокс-полоса
  panel(0.7, 6, "#ffffff", 4, [3.2, 0.5, 2.6], [0, 0.5, 0]); // правый
  panel(5, 3, "#fff4e6", 2.2, [0, 4.6, 0.5], [0, 0, 0]); // мягкий верх
  panel(6, 2.2, "#e7b46c", 3.5, [0, 1.2, -5], [0, 1, 0]); // тёплый контровой сзади
  panel(10, 1.2, "#3a2a1c", 1, [0, -2.5, 3], [0, 0, 0]); // отсвет от подиума снизу
  return s;
}

type Bottle = {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  refl: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  w: number;
  h: number;
  lift: number;
  dim: number;
  shown: number;
  loaded: boolean;
  /** объёмный флакон из той же картинки (вместо плоской) */
  solid?: ReturnType<typeof buildSolid>;
};

export class PerfumeRing {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private bottles: Bottle[] = [];
  private dial = new THREE.Group();
  private step: number;
  private n: number;
  private disposables: { dispose(): void }[] = [];

  // вращение
  private ring = 0;
  private vel = 0;
  private target: number | null = null;
  private lastTouch = -1e9;
  private front = -1;

  // указатель
  private down = false;
  private dragging = false;
  private startX = 0;
  private prevX = 0;
  private prevT = 0;
  private hover: number | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  // камера
  private sel: number | null = null;
  private focus = 0;
  private portrait = false;
  private base = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private near = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private look = new THREE.Vector3();

  private raf = 0;
  private timer = new THREE.Timer();
  private visible = true;
  private reduce: boolean;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private loadedCount = 0;

  constructor(
    private host: HTMLElement,
    images: string[],
    private ev: RingEvents,
    private facing: "camera" | "outward" = "camera",
    private solids: (SolidSpec | null)[] = [],
    /** лёгкий режим: без самовращения, ниже разрешение; витрина рисует, только когда её трогают */
    private lite = false,
    /** кадры не успевают даже при наименьшем разрешении — пора на лёгкий режим */
    private onSlow?: () => void,
  ) {
    this.n = images.length;
    this.step = (Math.PI * 2) / this.n;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // телефон: плотный экран и так сглаживает края — сглаживание (тяжёлое для видеокарты) не нужно
    this.touch = window.matchMedia("(pointer: coarse)").matches;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !this.touch, alpha: true, powerPreference: "high-performance" }));
    this.dprMax = this.dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : this.touch ? 1.5 : 1.75);
    r.setPixelRatio(this.dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const cv = r.domElement;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Круглая витрина ароматов: потяните в сторону, чтобы повернуть, нажмите на флакон, чтобы открыть");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;outline:none";
    host.appendChild(cv);

    // отражения для стекла стола и золота — одно лёгкое «студийное» окружение
    const pmrem = new THREE.PMREMGenerator(r);
    this.studio = pmrem.fromScene(studioScene(), 0.02).texture;
    this.scene.environment = this.studio;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.disposables.push(this.studio);

    this.buildStage();
    this.buildBottles(images);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.loop();
    });
    this.io.observe(host);

    cv.addEventListener("pointerdown", this.onDown);
    cv.addEventListener("pointermove", this.onMove);
    cv.addEventListener("pointerup", this.onUp);
    cv.addEventListener("pointercancel", this.onCancel);
    cv.addEventListener("pointerleave", this.onLeave);
    document.addEventListener("visibilitychange", this.onVis);

    this.camera.position.copy(this.base.pos);
    this.look.copy(this.base.look);
    this.loop();
  }

  // ───────────────────────── сцена

  private keep<T extends { dispose(): void }>(x: T) {
    this.disposables.push(x);
    return x;
  }

  private buildStage() {
    const s = this.scene;
    // ровный дневной свет: матовому камню нужен рассеянный свет и мягкий ключевой сверху-спереди
    s.add(new THREE.HemisphereLight(0xffffff, 0xe9e1d4, 1.6));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.4);
    key.position.set(-4, 9, 7);
    s.add(key);

    // стол: толстое прозрачное стекло. Верх почти невидим (блики и отражения студии),
    // кромка — полированная, с зеленоватым оттенком, как у настоящего толстого стекла
    const glassTop = this.keep(
      new THREE.MeshPhysicalMaterial({
        color: "#eef5f3",
        transparent: true,
        opacity: 0.32,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMap: this.studio,
        envMapIntensity: 1.1,
        depthWrite: false,
      }),
    );
    const glassEdge = this.keep(
      new THREE.MeshPhysicalMaterial({
        color: "#b9d6cc",
        transparent: true,
        opacity: 0.78,
        roughness: 0.06,
        clearcoat: 1,
        envMap: this.studio,
        envMapIntensity: 1.6,
        emissive: "#9cc4b6",
        emissiveIntensity: 0.18,
        depthWrite: false,
      }),
    );
    // у цилиндра группы материалов: бок, верх, низ
    const podium = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(R + 1.16, R + 1.16, 0.3, 180, 1)), [glassEdge, glassTop, glassTop]);
    podium.position.y = -0.15;
    podium.renderOrder = -2;
    s.add(podium);
    // светлая фаска по верхнему краю стекла
    const bevel = new THREE.Mesh(
      this.keep(new THREE.TorusGeometry(R + 1.16, 0.012, 8, 240)),
      this.keep(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 })),
    );
    bevel.rotation.x = Math.PI / 2;
    bevel.position.y = 0.0;
    s.add(bevel);

    // тень подиума на «полу» — витрина стоит, а не висит на белом
    const floor = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry((R + 2.6) * 2, (R + 2.6) * 2)),
      this.keep(
        new THREE.MeshBasicMaterial({
          map: this.keep(radial([[0, "rgba(60,70,64,0.22)"], [0.6, "rgba(60,70,64,0.12)"], [1, "rgba(60,70,64,0)"]])),
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.renderOrder = -3;
    s.add(floor);

    // ободок — сатинированное (матовое) золото
    const gold = this.keep(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.4 }));
    // тонкий золотой обод под стеклом и золотая опора-кольцо — стол «парит» на ней
    const rimLow = new THREE.Mesh(this.keep(new THREE.TorusGeometry(R + 1.1, 0.025, 12, 240)), gold);
    rimLow.rotation.x = Math.PI / 2;
    rimLow.position.y = -0.31;
    s.add(rimLow);
    const base = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(R * 0.42, R * 0.48, 0.3, 120, 1, true)), gold);
    base.position.y = -0.46;
    s.add(base);

    // циферблат — тонкие золотые линии, крутится вместе с флаконами
    const line = this.keep(new THREE.MeshBasicMaterial({ color: GOLD_LINE, transparent: true, opacity: 0.6, depthWrite: false }));
    const ringAt = (r0: number, r1: number, op = 1) => {
      const m = op === 1 ? line : this.keep(new THREE.MeshBasicMaterial({ color: GOLD_LINE, transparent: true, opacity: 0.6 * op, depthWrite: false }));
      const ring = new THREE.Mesh(this.keep(new THREE.RingGeometry(r0, r1, 240)), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.003;
      this.dial.add(ring);
    };
    ringAt(R - 0.012, R + 0.012);
    ringAt(R + 0.62, R + 0.635, 0.8);
    ringAt(R + 0.96, R + 0.972, 0.8);
    ringAt(1.35, 1.36, 0.6);

    const ticks = 120;
    const tick = new THREE.InstancedMesh(this.keep(new THREE.BoxGeometry(0.014, 0.002, 1)), line, ticks);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let j = 0; j < ticks; j++) {
      const a = (j / ticks) * Math.PI * 2;
      const len = j % 10 === 0 ? 0.3 : j % 5 === 0 ? 0.2 : 0.11;
      const rad = R + 0.96 - len / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m4.compose(new THREE.Vector3(Math.sin(a) * rad, 0.004, Math.cos(a) * rad), q, new THREE.Vector3(1, 1, len));
      tick.setMatrixAt(j, m4);
    }
    this.dial.add(tick);

    // точки-«гнёзда» под каждым флаконом
    const dot = this.keep(new THREE.CircleGeometry(0.035, 24));
    for (let i = 0; i < this.n; i++) {
      const a = i * this.step;
      const d = new THREE.Mesh(dot, line);
      d.rotation.x = -Math.PI / 2;
      d.position.set(Math.sin(a) * (R + 0.48), 0.004, Math.cos(a) * (R + 0.48));
      this.dial.add(d);
    }
    s.add(this.dial);
  }

  private buildBottles(images: string[]) {
    const geo = this.keep(new THREE.PlaneGeometry(1, 1));
    geo.translate(0, 0.5, 0);
    const flat = this.keep(new THREE.PlaneGeometry(1, 1));
    const shadowMap = this.keep(radial([[0, "rgba(0,0,0,0.62)"], [0.55, "rgba(0,0,0,0.22)"], [1, "rgba(0,0,0,0)"]], 128));
    const loader = new THREE.TextureLoader();
    // сильная анизотропная фильтрация не видна на флаконах, а видеокарту телефона нагружает
    const maxAniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    images.forEach((src, i) => {
      const mk = (reflect: number) =>
        this.keep(
          new THREE.ShaderMaterial({
            uniforms: { map: { value: null }, uDim: { value: 1 }, uOpacity: { value: 0 }, uReflect: { value: reflect } },
            vertexShader: vert,
            fragmentShader: frag,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
      const mesh = new THREE.Mesh(geo, mk(0));
      const refl = new THREE.Mesh(geo, mk(1));
      const shadow = new THREE.Mesh(
        flat,
        this.keep(new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, opacity: 0 })),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.008;
      mesh.userData.index = i;
      mesh.visible = refl.visible = false;
      const group = new THREE.Group();
      group.add(shadow, refl, mesh);
      this.scene.add(group);
      const b: Bottle = { group, mesh, refl, shadow, w: 0.6, h: H, lift: 0, dim: 1, shown: 0, loaded: false };
      this.bottles.push(b);

      loader.load(
        src,
        (tex) => {
          this.keep(tex);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          const img = tex.image as HTMLImageElement;
          let h = H;
          let w = (H * img.width) / img.height;
          if (w > MAX_W) {
            h *= MAX_W / w;
            w = MAX_W;
          }
          b.w = w;
          b.h = h;
          mesh.scale.set(w, h, 1);
          refl.scale.set(w, -h, 1);
          shadow.scale.set(w * 1.5, 0.5, 1);
          mesh.material.uniforms.map.value = tex;
          refl.material.uniforms.map.value = tex;
          // загружаем картинку в видеокарту сразу — иначе первые кадры флакон рисуется пустым (белым)
          this.renderer.initTexture(tex);
          mesh.visible = refl.visible = true;
          b.loaded = true;
          const solidSpec = this.solids[i];
          if (solidSpec) {
            // объёмный флакон: ждём фото сзади и сбоку (пока — обычная картинка), затем собираем фигуру
            const tl = new THREE.TextureLoader();
            const load = (u?: string) =>
              u
                ? tl
                    .loadAsync(u)
                    .then((t) => {
                      t.colorSpace = THREE.SRGBColorSpace;
                      t.anisotropy = maxAniso;
                      return t;
                    })
                    .catch(() => undefined)
                : Promise.resolve(undefined);
            // карта материалов — данные, а не цвет: без перевода цветового пространства
            const loadMask = (u?: string) => (u ? tl.loadAsync(u).catch(() => undefined) : Promise.resolve(undefined));
            Promise.all([load(solidSpec.back), load(solidSpec.side), loadMask(solidSpec.mask)]).then(([back, side, mask]) => {
              if (this.disposed) return;
              if (back) this.renderer.initTexture(back);
              if (side) this.renderer.initTexture(side);
              if (mask) this.renderer.initTexture(mask);
              const sb = buildSolid(img, tex, h, solidSpec, { back, side, mask });
              this.disposables.push(sb);
              sb.mesh.userData.index = i;
              b.group.add(sb.mesh);
              b.solid = sb;
              this.loop();
            });
          }
          this.loaded();
        },
        undefined,
        () => this.loaded(),
      );
    });
  }

  private disposed = false;
  private studio!: THREE.Texture;
  private touch = false;
  private lastDraw = 0;
  // разрешение подстраивается под скорость устройства
  private dprMax = 2;
  private dpr = 2;
  private slow = 0;

  private loaded() {
    if (++this.loadedCount === this.n) {
      this.ev.onReady();
    }
  }

  // ───────────────────────── раскладка камеры

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.portrait = aspect < 0.85;

    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const hT = t * aspect;
    const span = R + 1.35;
    // отъезжаем так, чтобы весь подиум помещался по ширине и по высоте
    if (this.portrait) {
      // на телефоне кольцо шире экрана: видна передняя дуга, камера выше — круг читается лучше
      const dist = Math.min(17.5, Math.max(14, (R * 0.95) / hT));
      this.base.pos.set(0, dist * 0.4, dist);
      this.base.look.set(0, 0.55, 0);
    } else {
      const dist = Math.max(span / hT + R * 0.35, (H + 2.2) / t, 11.5);
      this.base.pos.set(0, dist * 0.25, dist);
      this.base.look.set(0, -0.15, 0);
    }

    // крупный план: флакон слева от карточки (десктоп) или над ней (телефон)
    if (this.portrait) {
      this.near.pos.set(0, 1.3, R + 9.5);
      this.near.look.set(0, H * 0.5 - 1.0, R);
    } else {
      this.near.pos.set(1.05, 1.15, R + 4.9);
      this.near.look.set(1.05, H * 0.48, R);
    }
    if (!this.raf) this.frame(0);
  }

  // ───────────────────────── управление снаружи

  select(i: number | null) {
    this.sel = i;
    this.vel = 0;
    this.lastTouch = performance.now();
    if (i === null) {
      this.target = null;
      return;
    }
    const want = -i * this.step;
    this.target = want + Math.PI * 2 * Math.round((this.ring - want) / (Math.PI * 2));
    this.loop();
  }

  /** Повернуть кольцо на d флаконов (стрелки, клавиатура) */
  turn(d: number) {
    if (this.sel !== null) return;
    const from = this.target ?? this.ring;
    this.target = Math.round(from / this.step) * this.step - d * this.step;
    this.vel = 0;
    this.lastTouch = performance.now();
    this.loop();
  }

  frontIndex() {
    return this.front;
  }

  // ───────────────────────── указатель

  private pick(e: PointerEvent): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(
      this.bottles.filter((b) => b.loaded).map((b) => b.solid?.mesh ?? b.mesh),
      false,
    );
    // ближайший к зрителю флакон, если лучи задевают и дальний
    return hits.length ? (hits[0].object.userData.index as number) : null;
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.down = true;
    this.dragging = false;
    this.startX = this.prevX = e.clientX;
    this.prevT = performance.now();
    this.vel = 0;
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) {
      if (!this.dragging && Math.abs(e.clientX - this.startX) > 7 && this.sel === null) {
        this.dragging = true;
        this.target = null;
        this.renderer.domElement.setPointerCapture(e.pointerId);
        this.renderer.domElement.style.cursor = "grabbing";
      }
      if (this.dragging) {
        const now = performance.now();
        const k = (this.portrait ? 2.6 : 1.7) / this.host.clientWidth;
        const da = (e.clientX - this.prevX) * k * Math.PI;
        this.ring += da;
        const dt = Math.max(8, now - this.prevT) / 1000;
        this.vel = this.vel * 0.6 + (da / dt) * 0.4;
        this.prevX = e.clientX;
        this.prevT = now;
        this.lastTouch = now;
        this.loop();
      }
      return;
    }
    if (e.pointerType === "touch") return;
    const h = this.pick(e);
    if (h !== this.hover) {
      this.hover = h;
      this.renderer.domElement.style.cursor = h !== null ? "pointer" : "grab";
      this.ev.onHover(h);
      this.loop();
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    this.down = false;
    if (this.dragging) {
      this.dragging = false;
      this.lastTouch = performance.now();
      this.renderer.domElement.style.cursor = "grab";
      // слишком медленный бросок — просто доводим до ближайшего флакона
      if (Math.abs(this.vel) < 0.35) this.target = Math.round(this.ring / this.step) * this.step;
      return;
    }
    const i = this.pick(e);
    if (i !== null) this.ev.onPick(i);
    else this.ev.onEmpty();
  };

  private onCancel = () => {
    this.down = false;
    this.dragging = false;
  };

  private onLeave = () => {
    if (this.hover !== null) {
      this.hover = null;
      this.ev.onHover(null);
    }
  };

  private onVis = () => {
    if (!document.hidden) this.loop();
  };

  // ───────────────────────── кадр

  private loop() {
    if (this.raf || !this.visible || document.hidden) return;
    this.timer.update();
    const tick = (t: number) => {
      this.raf = 0;
      if (!this.visible || document.hidden) return;
      // телефон: пока витрина просто медленно плывёт, хватает 30 кадров в секунду — вдвое меньше нагрузки и батареи
      const idle = this.touch && !this.down && this.target === null && this.sel === null && this.focus < 0.001 && Math.abs(this.vel) < 0.01;
      // не чаще 60 кадров в секунду на любом экране: на 120–240 Гц иначе работы вдвое-вчетверо больше
      if (t - this.lastDraw < (idle ? 30 : 15.5)) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      this.lastDraw = t;
      this.timer.update(t);
      const busy = this.frame(Math.min(this.timer.getDelta(), 0.05));
      if (busy) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Возвращает true, пока в сцене что-то движется */
  /** Если кадры не успевают (медленнее ~38 в секунду), понемногу снижаем разрешение; если запас есть — возвращаем */
  private adapt(dt: number) {
    if (dt <= 0 || dt >= 0.05) return; // первый кадр после паузы не показателен
    if (dt > 0.026) this.slow++;
    else if (dt < 0.0145) this.slow--;
    let next = this.dpr;
    if (this.slow > 24 && this.dpr <= 1) {
      // разрешение уже минимальное, а кадры всё равно не успевают
      this.slow = 0;
      this.onSlow?.();
      return;
    }
    if (this.slow > 24 && this.dpr > 1) next = Math.max(1, this.dpr - 0.25);
    else if (this.slow < -240 && this.dpr < this.dprMax) next = Math.min(this.dprMax, this.dpr + 0.25);
    else return;
    this.slow = 0;
    this.dpr = next;
    this.renderer.setPixelRatio(next);
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
  }

  private frame(dt: number): boolean {
    const now = performance.now();
    const damp = (k: number) => (this.reduce ? 1 : 1 - Math.exp(-dt * k));
    let moving = false;

    // вращение кольца
    if (!this.dragging) {
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
          if (!this.reduce && !this.lite && this.sel === null) {
            // после касания ждём, потом витрина снова сама медленно плывёт (в лёгком режиме — стоит)
            if (now - this.lastTouch > 2600) this.ring -= 0.075 * dt;
            moving = true;
          }
        }
      }
    } else moving = true;
    this.dial.rotation.y = this.ring;

    const f0 = this.focus;
    this.focus += ((this.sel !== null ? 1 : 0) - this.focus) * damp(2.6);
    if (Math.abs(this.focus - f0) > 1e-4) moving = true;
    const f = this.focus * this.focus * (3 - 2 * this.focus);

    const cam = this.camera;
    cam.position.lerpVectors(this.base.pos, this.near.pos, f);
    this.look.lerpVectors(this.base.look, this.near.look, f);
    cam.lookAt(this.look);

    // флаконы
    const front = ((Math.round(-this.ring / this.step) % this.n) + this.n) % this.n;
    if (front !== this.front) {
      this.front = front;
      this.ev.onFront(front);
    }
    // в лёгком режиме выбранный флакон не парит — пока открыта карточка, видеокарта отдыхает
    const bob = this.reduce || this.lite ? 0 : Math.sin(now / 900) * 0.025;
    if (this.sel !== null && !this.reduce && !this.lite) moving = true; // выбранный флакон чуть парит
    this.bottles.forEach((b, i) => {
      const a = i * this.step + this.ring;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      const k = (Math.cos(a) + 1) / 2; // 1 — к зрителю, 0 — у дальней стенки
      const isSel = this.sel === i;
      const lift = isSel ? 0.1 + bob : this.hover === i && this.sel === null ? 0.12 : 0;
      b.lift += (lift - b.lift) * damp(9);
      let dim = 0.5 + 0.5 * Math.pow(k, 1.2);
      if (this.hover === i && this.sel === null) dim = Math.min(1.12, dim * 1.18);
      dim *= 1 - f * (isSel ? 0 : 0.86);
      if (isSel) dim = Math.max(dim, 1);
      b.dim += (dim - b.dim) * damp(8);
      if (b.loaded) b.shown += (1 - b.shown) * damp(3);
      if (Math.abs(b.lift - lift) > 1e-3 || Math.abs(b.dim - dim) > 1e-3 || (b.loaded && b.shown < 0.999)) moving = true;

      b.group.position.set(x, 0, z);
      // «outward» — флакон неподвижно стоит лицом наружу кольца и едет вместе с ним;
      // «camera» — всегда повёрнут к зрителю
      const yaw = this.facing === "outward" ? a : Math.atan2(cam.position.x - x, cam.position.z - z);
      b.group.rotation.y = yaw;
      b.mesh.position.y = b.lift;
      b.refl.position.y = -b.lift;
      const op = (0.42 + 0.58 * k) * b.shown * (isSel ? 1 : 1 - f * 0.55);
      b.mesh.material.uniforms.uDim.value = b.dim;
      const solidOn = !!b.solid && b.shown > 0.6;
      b.mesh.material.uniforms.uOpacity.value = solidOn ? 0 : op;
      b.mesh.visible = !solidOn; // не рисуем зря невидимую картинку под объёмным флаконом
      if (b.solid) {
        b.solid.mesh.position.y = b.lift;
        // выбранный флакон на крупном плане медленно поворачивается — видно бок и объём
        b.solid.mesh.rotation.y = isSel && !this.reduce ? Math.sin(now / 1700) * 0.75 * f : 0;
        // появляется, когда картинка уже проявилась (в светлой теме «затухание» — это белая дымка)
        b.solid.mesh.visible = b.shown > 0.6;
        b.solid.setDim(b.dim);
      }
      b.refl.material.uniforms.uDim.value = b.dim;
      // отражение в стекле стола
      b.refl.material.uniforms.uOpacity.value = op * 0.8 * (1 - b.lift * 2.5);
      b.shadow.material.opacity = Math.min(1, op * 1.2) * (0.9 - b.lift * 2.2);
      // прозрачное рисуем от дальнего к ближнему
      const order = Math.round(k * 200);
      b.mesh.renderOrder = 400 + order;
      b.solid?.setOrder(600 + order * 2);
      b.refl.renderOrder = 100 + order;
      b.shadow.renderOrder = 50;
    });

    this.renderer.render(this.scene, cam);
    this.adapt(dt);
    return moving || this.down;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.visible = false;
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    const cv = this.renderer.domElement;
    cv.removeEventListener("pointerdown", this.onDown);
    cv.removeEventListener("pointermove", this.onMove);
    cv.removeEventListener("pointerup", this.onUp);
    cv.removeEventListener("pointercancel", this.onCancel);
    cv.removeEventListener("pointerleave", this.onLeave);
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    cv.remove();
  }
}
