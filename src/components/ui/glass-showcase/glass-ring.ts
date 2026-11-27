import * as THREE from "three";
import { buildBottle, HT, softboxEnv, type Bottle3DSpec } from "./bottle3d";
import { buildPhotoBottle } from "./photo-bottle";
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

/**
 * Круглая витрина на фотореалистичных стеклянных флаконах (Three.js).
 * Флаконы стоят по кругу на стеклянном столе лицом наружу; кольцо крутят пальцем/мышью с инерцией.
 * Когда кольцо разгоняется, флаконы чуть кренятся и жидкость в них раскачивается, потом успокаивается.
 * Выбор флакона — кольцо доворачивает его к зрителю, камера подъезжает.
 * Рисуется только пока что-то движется; в покое — ни одного кадра. Не чаще 60 кадров в секунду.
 * Тот же интерфейс, что у PerfumeRing: select, turn, dispose + события.
 */

export type GlassRingEvents = {
  onFront: (i: number) => void;
  onPick: (i: number) => void;
  onEmpty: () => void;
  onReady: () => void;
};

const BG = new THREE.Color("#f5f1ea");
const GOLD = new THREE.Color("#c9a463");
const FOV = 30;

export class GlassRing {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  // spin — свой поворот флакона (крутят в крупном плане), spinV — его инерция; spread — насколько отодвинут в сторону
  private bottles: { b: RingBottle; g: THREE.Group; box: THREE.Box3; spin: number; spinV: number; spread: number }[] = [];
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

  constructor(private host: HTMLElement, specs: RingSpec[], private ev: GlassRingEvents, base = "") {
    this.n = specs.length;
    this.slots = Math.max(3, this.n);
    this.S = this.n > 3 ? 0.68 : 1;
    this.step = (Math.PI * 2) / this.slots;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: !touch, alpha: true, powerPreference: "high-performance" }));
    r.setClearColor(0x000000, 0); // прозрачный — за витриной виден фон страницы (сетка)
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 1.75));
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
    this.buildTable();

    const loader = new THREE.TextureLoader();
    let pending = specs.reduce((n, s) => n + ("photo" in s ? 2 : (s.label ? 1 : 0) + (s.photoCap ? 1 : 0)), 0);
    const done = () => {
      if (--pending <= 0) this.ev.onReady();
      this.force = true;
      this.loop();
    };
    if (!pending) queueMicrotask(() => this.ev.onReady());
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
        const g = new THREE.Group();
        g.scale.setScalar(this.S);
        [...pb.scene.children].forEach((c) => g.add(c));
        this.scene.add(g);
        this.bottles.push({ b: pb, g, box: new THREE.Box3(), spin: 0, spinV: 0, spread: 0 });
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
      this.bottles.push({ b, g, box: new THREE.Box3(), spin: 0, spinV: 0, spread: 0 });
    });

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

  /** Стеклянный стол: тонкая прозрачная плита с зеленоватой кромкой, золотой обод и опора */
  private buildTable() {
    const R = this.R + HT * 0.4;
    const k = <T extends { dispose(): void }>(x: T) => (this.extra.push(x), x);
    const top = new THREE.Mesh(
      k(new THREE.CylinderGeometry(R, R, 0.16, 160, 1)),
      [
        k(new THREE.MeshPhysicalMaterial({ color: "#cfe3dc", roughness: 0.05, transmission: 1, thickness: 0.4, ior: 1.5, attenuationColor: new THREE.Color("#bcd8cd"), attenuationDistance: 0.8 })),
        k(new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.03, transmission: 1, thickness: 0.16, ior: 1.5, attenuationColor: new THREE.Color("#e6f0ec"), attenuationDistance: 4, envMapIntensity: 0.8 })),
        k(new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.03, transmission: 1, thickness: 0.16, ior: 1.5 })),
      ],
    );
    top.position.y = -0.08;
    this.scene.add(top);
    const gold = k(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.3 }));
    const rim = new THREE.Mesh(k(new THREE.TorusGeometry(R * 0.97, 0.025, 12, 200)), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.17;
    this.scene.add(rim);
    const stem = new THREE.Mesh(k(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 48, 1, true)), gold);
    stem.position.y = -0.78;
    this.scene.add(stem);
    // тень стола на «полу»
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(60,50,40,0.22)");
    gr.addColorStop(1, "rgba(60,50,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const t = k(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(k(new THREE.PlaneGeometry(R * 2.6, R * 2.6)), k(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.4;
    this.scene.add(floor);
  }

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
    const span = this.R + HT * 0.45;
    if (this.portrait && this.n > 3) {
      // телефон: кольцо шире экрана — видна передняя дуга с крупными флаконами, камера выше
      const dist = Math.max((this.R * 0.95) / (t * aspect), (HT * 1.2) / t);
      this.base.pos.set(0, dist * 0.42, dist);
      this.base.look.set(0, HT * 0.35, 0);
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
    const nd = this.portrait ? bh * 3.4 : bh * 2.3;
    const shift = this.portrait ? 0 : bh * 0.32;
    this.near.pos.set(shift, bh * 0.6, this.R + nd);
    this.near.look.set(shift, this.portrait ? bh * 0.2 : bh * 0.46, this.R);
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
    }
    this.loop();
  }

  turn(d: number) {
    if (this.sel !== null) return;
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
  };

  private onMove = (e: PointerEvent) => {
    if (this.down) {
      if (!this.dragging && Math.abs(e.clientX - this.startX) > 7) {
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
    this.loop();
  };

  // ───────────────────────── кадр

  private loop() {
    if (this.raf || !this.visible || this.disposed) return;
    const tick = (t: number) => {
      this.raf = 0;
      if (!this.visible || this.disposed) return;
      if (this.last && t - this.lastDraw < 15.5) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.033, this.last ? (t - this.last) / 1000 : 0.016);
      this.last = t;
      this.lastDraw = t;
      const busy = this.frame(dt);
      if (busy) this.raf = requestAnimationFrame(tick);
      else this.last = 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number): boolean {
    const damp = (k: number) => 1 - Math.exp(-dt * k);
    let moving = this.down || this.force;
    this.force = false;

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

    const f0 = this.focus;
    this.focus += ((this.sel !== null ? 1 : 0) - this.focus) * damp(2.6);
    if (Math.abs(this.focus - f0) > 1e-4) moving = true;
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    this.camera.position.lerpVectors(this.base.pos, this.near.pos, f);
    this.look.lerpVectors(this.base.look, this.near.look, f);
    this.camera.lookAt(this.look);

    const front = this.slotAt(this.ring);
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
      x.g.position.set(Math.sin(a) * this.R, 0, Math.cos(a) * this.R);
      x.g.rotation.y = a + x.spin; // лицом наружу кольца + свой поворот
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
    this.extra.forEach((x) => x.dispose());
    this.env.dispose();
    this.renderer.dispose();
    cv.remove();
  }
}
