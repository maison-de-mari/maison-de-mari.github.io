import type { RingEvents } from "./scene";

/**
 * Та же круглая витрина, но без WebGL — на CSS 3D (perspective + translate3d).
 * Флаконы — обычные <img>: всегда смотрят на зрителя, задние уходят в глубину и темнеют,
 * отражение — -webkit-box-reflect. «Камера» — 2D-масштаб всей сцены к выбранному флакону.
 * Интерфейс совпадает с PerfumeRing, поэтому карточка и кнопки общие.
 */

const R = 4.4;
const H = 1.7;
const MAX_W = 1.05;
const GOLD = "#d8b47a";

type Item = { el: HTMLDivElement; img: HTMLImageElement; w: number; h: number; lift: number; dim: number; loaded: boolean };

export class CssRing {
  private root: HTMLDivElement;
  private disc: HTMLDivElement;
  private items: Item[] = [];
  private n: number;
  private step: number;
  private u = 60; // px в одной единице сцены (общий план)
  private floor = 0;
  private portrait = false;
  private side!: HTMLDivElement;
  // крупный план: во сколько раз приблизить и куда сдвинуть
  private zoomTo = 2;
  private shift = { x: 0, y: 0 };
  private pivot = { x: 0, y: 0 };

  private ring = 0;
  private vel = 0;
  private target: number | null = null;
  private lastTouch = -1e9;
  private front = -1;
  private sel: number | null = null;
  private focus = 0;
  private hover: number | null = null;

  private down = false;
  private dragging = false;
  private startX = 0;
  private prevX = 0;
  private prevT = 0;

  private raf = 0;
  private last = 0;
  private visible = true;
  private reduce: boolean;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private loadedCount = 0;

  constructor(private host: HTMLElement, images: string[], private ev: RingEvents) {
    this.n = images.length;
    this.step = (Math.PI * 2) / this.n;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const root = (this.root = document.createElement("div"));
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", "Круглая витрина ароматов: потяните в сторону, чтобы повернуть, нажмите на флакон, чтобы открыть");
    root.style.cssText = "position:absolute;inset:0;overflow:hidden;touch-action:pan-y;cursor:grab";

    // подиум: бок (тёмный эллипс чуть ниже) + верх с циферблатом
    const side = document.createElement("div");
    const disc = (this.disc = document.createElement("div"));
    for (const d of [side, disc]) {
      d.style.cssText = "position:absolute;left:0;top:0;border-radius:50%;pointer-events:none";
      root.appendChild(d);
    }
    this.side = side;
    side.style.background = "linear-gradient(90deg,#050302,#24170f 30%,#3a2a1d 50%,#24170f 70%,#050302)";
    side.style.boxShadow = `0 0 0 2px ${GOLD}88, 0 40px 80px -20px rgba(0,0,0,.8)`;
    disc.style.background = [
      // круг под флаконами, кольца у края и тёплое пятно в центре
      `radial-gradient(circle, transparent 0 77.4%, ${GOLD}77 77.4% 78%, transparent 78% 88.6%, ${GOLD}66 88.6% 89%, transparent 89% 98.6%, ${GOLD}55 98.6% 99%, transparent 99%)`,
      "radial-gradient(circle at 50% 50%, rgba(232,190,120,.28), rgba(200,140,70,.06) 30%, transparent 45%)",
      "radial-gradient(circle at 50% 40%, #241812, #120b08 70%)",
    ].join(",");
    disc.style.boxShadow = `inset 0 0 0 2px ${GOLD}, inset 0 0 60px rgba(0,0,0,.7)`;
    // деления — только в полосе у края
    const ticks = document.createElement("div");
    ticks.style.cssText =
      `position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(from 0deg, ${GOLD}66 0 0.3deg, transparent 0.3deg 3deg);` +
      "mask-image:radial-gradient(circle, transparent 0 89.5%, #000 90% 98%, transparent 98.5%);-webkit-mask-image:radial-gradient(circle, transparent 0 89.5%, #000 90% 98%, transparent 98.5%)";
    disc.appendChild(ticks);

    images.forEach((src, i) => {
      const el = document.createElement("div");
      el.dataset.i = String(i);
      el.style.cssText = "position:absolute;left:0;top:0;opacity:0;will-change:transform,filter,opacity";
      const shadow = document.createElement("span");
      shadow.style.cssText =
        "position:absolute;left:-18%;right:-18%;bottom:-5%;height:10%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.6),transparent);pointer-events:none";
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.style.cssText =
        "position:relative;display:block;width:100%;height:100%;-webkit-user-drag:none;user-select:none;" +
        "-webkit-box-reflect:below 1px linear-gradient(transparent 64%, rgba(255,255,255,.22))";
      el.append(shadow, img);
      root.appendChild(el);
      const it: Item = { el, img, w: 0.6, h: H, lift: 0, dim: 1, loaded: false };
      this.items.push(it);
      const done = () => {
        if (img.naturalWidth) {
          let h = H;
          let w = (H * img.naturalWidth) / img.naturalHeight;
          if (w > MAX_W) {
            h *= MAX_W / w;
            w = MAX_W;
          }
          it.w = w;
          it.h = h;
          it.loaded = true;
        }
        if (++this.loadedCount === this.n) this.ev.onReady();
        this.loop();
      };
      img.onload = done;
      img.onerror = done;
      img.src = src;
    });

    host.appendChild(root);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.loop();
    });
    this.io.observe(host);

    root.addEventListener("pointerdown", this.onDown);
    root.addEventListener("pointermove", this.onMove);
    root.addEventListener("pointerup", this.onUp);
    root.addEventListener("pointercancel", this.onCancel);
    root.addEventListener("pointerleave", this.onLeave);
    document.addEventListener("visibilitychange", this.onVis);
    this.loop();
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.portrait = w / h < 0.85;
    // на телефоне кольцо шире экрана, как и в three.js-версии
    this.u = this.portrait ? Math.min(w / 6.2, h / 13) : Math.min(w / (2 * (R + 1.5)), h / 8.6);
    this.floor = h * 0.6;

    // крупный план. Флакон напротив зрителя стоит ближе (z = R) и после перспективы
    // выглядит крупнее и ниже — считаем, где он на экране, и куда его надо привести.
    const P = R * this.u * 3.4;
    const oy = this.floor - P * (this.portrait ? 0.42 : 0.3);
    const s = P / (P - R * this.u);
    const projY = oy + (this.floor - (H / 2) * this.u - oy) * s;
    const projH = H * this.u * s;
    this.zoomTo = (h * (this.portrait ? 0.3 : 0.56)) / projH;
    const target = { x: this.portrait ? w / 2 : w * 0.3, y: h * (this.portrait ? 0.3 : 0.47) };
    this.pivot = { x: w / 2, y: this.floor - (H / 2) * this.u };
    this.shift = {
      x: target.x - this.pivot.x - (w / 2 - this.pivot.x) * this.zoomTo,
      y: target.y - this.pivot.y - (projY - this.pivot.y) * this.zoomTo,
    };
    if (!this.raf) this.frame(0);
  }

  // ───────────────────────── снаружи

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

  turn(d: number) {
    if (this.sel !== null) return;
    const from = this.target ?? this.ring;
    this.target = Math.round(from / this.step) * this.step - d * this.step;
    this.vel = 0;
    this.lastTouch = performance.now();
    this.loop();
  }

  // ───────────────────────── указатель

  private idx(e: Event): number | null {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    return el ? Number(el.dataset.i) : null;
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
        this.root.setPointerCapture(e.pointerId);
        this.root.style.cursor = "grabbing";
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
    const h = this.idx(e);
    if (h !== this.hover) {
      this.hover = h;
      this.root.style.cursor = h !== null ? "pointer" : "grab";
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
      this.root.style.cursor = "grab";
      if (Math.abs(this.vel) < 0.35) this.target = Math.round(this.ring / this.step) * this.step;
      return;
    }
    const i = this.idx(e);
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
    this.last = performance.now();
    const tick = (t: number) => {
      this.raf = 0;
      if (!this.visible || document.hidden) return;
      const dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      if (this.frame(Math.max(0, dt))) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number): boolean {
    const now = performance.now();
    const damp = (k: number) => (this.reduce ? 1 : 1 - Math.exp(-dt * k));
    let moving = false;

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
          if (!this.reduce && this.sel === null) {
            if (now - this.lastTouch > 2600) this.ring -= 0.075 * dt;
            moving = true;
          }
        }
      }
    } else moving = true;

    const f0 = this.focus;
    this.focus += ((this.sel !== null ? 1 : 0) - this.focus) * damp(2.6);
    if (Math.abs(this.focus - f0) > 1e-4) moving = true;
    const f = this.focus * this.focus * (3 - 2 * this.focus);

    // «камера»: вся сцена раскладывается заново в крупном масштабе (а не растягивается),
    // поэтому флакон на крупном плане остаётся чётким
    const w = this.host.clientWidth;
    const Z = 1 + f * (this.zoomTo - 1);
    const u = this.u * Z;
    const map = (bx: number, by: number) => ({
      x: this.pivot.x + (bx - this.pivot.x) * Z + this.shift.x * f,
      y: this.pivot.y + (by - this.pivot.y) * Z + this.shift.y * f,
    });
    const P = R * this.u * 3.4;
    const o = map(w / 2, this.floor - P * (this.portrait ? 0.42 : 0.3));
    this.root.style.perspective = `${P * Z}px`;
    this.root.style.perspectiveOrigin = `${o.x}px ${o.y}px`;
    const D = 2 * (R + 1.12) * u;
    const c = map(w / 2, this.floor);
    const cs = map(w / 2, this.floor + 0.34 * this.u);
    for (const d of [this.disc, this.side]) d.style.width = d.style.height = `${D}px`;
    this.disc.style.transform = `translate3d(${c.x - D / 2}px, ${c.y - D / 2}px, 0) rotateX(90deg) rotateZ(${-this.ring}rad)`;
    this.side.style.transform = `translate3d(${cs.x - D / 2}px, ${cs.y - D / 2}px, 0) rotateX(90deg)`;

    const front = ((Math.round(-this.ring / this.step) % this.n) + this.n) % this.n;
    if (front !== this.front) {
      this.front = front;
      this.ev.onFront(front);
    }
    const bob = this.reduce ? 0 : Math.sin(now / 900) * 0.025;
    if (this.sel !== null && !this.reduce) moving = true;

    this.items.forEach((it, i) => {
      const a = i * this.step + this.ring;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      const k = (Math.cos(a) + 1) / 2;
      const isSel = this.sel === i;
      const lift = isSel ? 0.1 + bob : this.hover === i && this.sel === null ? 0.12 : 0;
      it.lift += (lift - it.lift) * damp(9);
      let dim = 0.35 + 0.65 * Math.pow(k, 1.3);
      if (this.hover === i && this.sel === null) dim = Math.min(1.1, dim * 1.15);
      dim *= 1 - f * (isSel ? 0 : 0.7);
      if (isSel) dim = Math.max(dim, 1);
      it.dim += (dim - it.dim) * damp(8);
      if (Math.abs(it.lift - lift) > 1e-3 || Math.abs(it.dim - dim) > 1e-3) moving = true;
      const op = it.loaded ? (0.45 + 0.55 * k) * (isSel ? 1 : 1 - f * 0.55) : 0;

      const st = it.el.style;
      const p = map(w / 2 + x * this.u, this.floor - (it.h + it.lift) * this.u);
      st.width = `${it.w * u}px`;
      st.height = `${it.h * u}px`;
      st.transform = `translate3d(${p.x - (it.w * u) / 2}px, ${p.y}px, ${z * u}px)`;
      st.zIndex = String(10 + Math.round(k * 200));
      st.opacity = op.toFixed(3);
      st.filter = `brightness(${it.dim.toFixed(3)})`;
    });
    return moving || this.down;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.visible = false;
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    this.root.remove();
  }
}
