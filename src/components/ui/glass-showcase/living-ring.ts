import * as THREE from "three";

/**
 * «Живое» кольцо под витриной: гипсовый обод цвета бумаги сайта, в нём — канал молочной воды.
 * Флаконы стоят в воде и отражаются в ней (отражение — сами флаконы, отзеркаленные под воду,
 * в отдельный кадр в полразмера; вода искажает его своими волнами).
 * Вода живая: медленная зыбь, блики, световая сетка на дне, золотой отсвет бежит по краю;
 * от мыши, вращения кольца и выбора флакона расходятся круги; по воде плывут лепестки.
 *
 * Форма раскрывается (setShape): круг размыкается с дальней стороны и вытягивается в длинную С-образную дугу.
 * Все части подиума — сечения, протянутые вдоль кривой (sweep), поэтому гнутся вместе с ней:
 * точка с «долей пути» s и отступом от ряда флаконов d всегда остаётся своей точкой подиума.
 * Флаконы и лепестки ставятся по тем же правилам (place) — порядок и привязка сохраняются.
 */

const MAX_RIPPLES = 20;
const TAU = Math.PI * 2;
const wrap01 = (x: number) => x - Math.floor(x);

const waterVert = /* glsl */ `
attribute float aD;
attribute float aS;
varying vec3 vW;
varying float vD;
varying float vS;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vD = aD;
  vS = aS;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const waterFrag = /* glsl */ `
uniform sampler2D refl;
uniform vec2 res;
uniform float time;
uniform vec4 rip[${MAX_RIPPLES}];
uniform vec2 edges;   // внутренний и внешний край воды — отступ от ряда флаконов
uniform vec3 body;
uniform vec3 deep;
uniform vec3 gold;
uniform vec3 sky;     // «небо», что отражается у пологих взглядов: светлая бумага или графит
varying vec3 vW;
varying float vD;
varying float vS;
float swell(vec2 p){
  return 0.010 * sin(dot(p, vec2(0.83, 0.55)) * 2.3 + time * 0.9)
       + 0.006 * sin(dot(p, vec2(-0.45, 0.89)) * 4.1 - time * 1.3)
       + 0.003 * sin(dot(p, vec2(0.97, -0.24)) * 8.7 + time * 2.1);
}
float ripples(vec2 p){
  float h = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = rip[i];
    float age = time - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 5.0) continue;
    float d = length(p - r.xy);
    float x = d - age * 0.85;
    h += r.w * 0.04 * exp(-x * x * 7.0) * sin(x * 19.0) * exp(-age * 0.85) / (1.0 + d * 1.4);
  }
  return h;
}
float H(vec2 p){ return swell(p) + ripples(p); }
float caustic(vec2 p){
  vec2 q = p * 3.1;
  float v = sin(q.x + sin(q.y * 1.3 + time * 0.7) * 1.2 + time * 0.5)
          + sin(q.y * 1.1 + sin(q.x * 0.9 - time * 0.6) * 1.3 - time * 0.4);
  return pow(1.0 - abs(v * 0.5), 7.0);
}
float wrapA(float a){ return mod(a + 3.14159265, 6.2831853) - 3.14159265; }
void main(){
  vec2 p = vW.xz;
  float e = 0.025;
  float h0 = H(p);
  vec3 n = normalize(vec3(-(H(p + vec2(e, 0.0)) - h0) / e, 1.0, -(H(p + vec2(0.0, e)) - h0) / e));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  float across = clamp((vD - edges.x) / (edges.y - edges.x), 0.0, 1.0);
  // глубже к середине канала — чуть темнее и теплее
  vec3 c = mix(body, deep, sin(across * 3.14159) * 0.75);
  c += vec3(1.0, 0.97, 0.9) * 0.1 * caustic(p + n.xz * 0.8);
  // гребни кругов чуть светлее — круги видны и без отражения
  c += vec3(1.0, 0.99, 0.96) * clamp(ripples(p) * 6.0, -0.05, 0.12);
  // отражение флаконов, искажённое волнами
  vec4 rf = texture2D(refl, gl_FragCoord.xy / res + n.xz * 0.09);
  c = mix(c, rf.rgb, rf.a * mix(0.5, 0.92, fres));
  // небо (светлая бумага) у пологих взглядов
  c = mix(c, sky, fres * 0.45 * (1.0 - rf.a));
  // блики
  vec3 L = normalize(vec3(-0.35, 0.5, -1.0));
  float s = max(dot(reflect(-V, n), L), 0.0);
  c += vec3(1.0, 0.98, 0.94) * (pow(s, 260.0) * 1.2 + pow(s, 26.0) * 0.07);
  // два золотых отсвета бегут вдоль краёв навстречу друг другу
  float ang = vS * 6.2831853;
  float a1 = wrapA(ang - time * 0.21), a2 = wrapA(ang + time * 0.13 + 2.0);
  float edge = exp(-(edges.y - vD) * 5.0) + exp(-(vD - edges.x) * 5.0);
  c += gold * (exp(-a1 * a1 * 5.0) + 0.6 * exp(-a2 * a2 * 8.0)) * edge * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

type Petal = { a: number; r: number; va: number; vr: number; yaw: number; spin: number; ph: number; s: number; tilt: number; lo: number; hi: number; drift: number };

/** точка сечения: отступ от ряда флаконов d, высота y, нормаль в плоскости сечения (nd, ny) */
type ProfPt = { d: number; y: number; nd: number; ny: number };

function petalTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.translate(64, 64);
  x.beginPath();
  x.moveTo(0, 58);
  x.bezierCurveTo(-50, 38, -54, -34, -10, -58);
  x.quadraticCurveTo(0, -48, 10, -58);
  x.bezierCurveTo(54, -34, 50, 38, 0, 58);
  x.closePath();
  const g = x.createRadialGradient(0, 52, 2, 0, 10, 70);
  g.addColorStop(0, "#c9a9a4");
  g.addColorStop(0.35, "#f1e6e3");
  g.addColorStop(1, "#ffffff");
  x.fillStyle = g;
  x.fill();
  // тонкие прожилки
  x.clip();
  x.strokeStyle = "rgba(170,130,125,0.18)";
  x.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    x.beginPath();
    x.moveTo(0, 56);
    x.quadraticCurveTo(i * 9, 0, i * 15, -56);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** нормали ломаной сечения: перпендикуляр к направлению обхода, сглаженный между соседями */
function polyline(pts: [number, number][], closed = false): ProfPt[] {
  const n = pts.length;
  return pts.map(([d, y], i) => {
    const p = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const q = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const td = q[0] - p[0];
    const ty = q[1] - p[1];
    const l = Math.hypot(td, ty) || 1;
    return { d, y, nd: -ty / l, ny: td / l };
  });
}

/** сечение, протянутое вдоль кривой: столбцы по доле пути s ∈ [0, 1], строки — точки сечения */
class Sweep {
  readonly geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(
    readonly prof: ProfPt[],
    readonly segs: number,
    closed: boolean,
    extra?: (j: number, k: number) => [number, number],
  ) {
    const P = prof.length;
    const cols = segs + 1;
    this.pos = new Float32Array(cols * P * 3);
    this.nrm = new Float32Array(cols * P * 3);
    const uv = new Float32Array(cols * P * 2);
    const aD = new Float32Array(cols * P);
    const aS = new Float32Array(cols * P);
    for (let j = 0; j < cols; j++)
      for (let k = 0; k < P; k++) {
        const v = j * P + k;
        const [u0, v0] = extra ? extra(j, k) : [j / segs, k / Math.max(1, P - 1)];
        uv[v * 2] = u0;
        uv[v * 2 + 1] = v0;
        aD[v] = prof[k].d;
        aS[v] = j / segs;
      }
    const idx: number[] = [];
    const rows = closed ? P : P - 1;
    for (let j = 0; j < segs; j++)
      for (let k = 0; k < rows; k++) {
        const k1 = (k + 1) % P;
        const a = j * P + k;
        const b = (j + 1) * P + k;
        const c = (j + 1) * P + k1;
        const d = j * P + k1;
        idx.push(a, b, d, b, c, d);
      }
    this.geo.setIndex(idx);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute("aD", new THREE.BufferAttribute(aD, 1));
    this.geo.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
  }
  /** уложить вдоль текущей кривой */
  bend(ring: LivingRing) {
    const P = this.prof.length;
    for (let j = 0; j <= this.segs; j++) {
      const th = ring.thetaOfS(j / this.segs);
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      for (let k = 0; k < P; k++) {
        const p = this.prof[k];
        const v = (j * P + k) * 3;
        const r = ring.rho + p.d;
        this.pos[v] = sn * r;
        this.pos[v + 1] = p.y;
        this.pos[v + 2] = ring.zc + cs * r;
        this.nrm[v] = p.nd * sn;
        this.nrm[v + 1] = p.ny;
        this.nrm[v + 2] = p.nd * cs;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

/** торец разомкнутого подиума: сечение обода, повёрнутое поперёк дуги */
class Cap {
  readonly geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(
    readonly prof: [number, number][],
    readonly end: 0 | 1,
  ) {
    const tri = THREE.ShapeUtils.triangulateShape(
      prof.map(([d, y]) => new THREE.Vector2(d, y)),
      [],
    );
    this.pos = new Float32Array(prof.length * 3);
    this.nrm = new Float32Array(prof.length * 3);
    this.geo.setIndex(tri.flat());
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
  }
  bend(ring: LivingRing) {
    const th = ring.thetaOfS(this.end);
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    // торец смотрит вдоль дуги наружу: у начала — назад, у конца — вперёд по ходу
    const sgn = this.end ? 1 : -1;
    this.prof.forEach(([d, y], k) => {
      const r = ring.rho + d;
      this.pos[k * 3] = sn * r;
      this.pos[k * 3 + 1] = y;
      this.pos[k * 3 + 2] = ring.zc + cs * r;
      this.nrm[k * 3] = cs * sgn;
      this.nrm[k * 3 + 1] = 0;
      this.nrm[k * 3 + 2] = -sn * sgn;
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

export class LivingRing {
  readonly group = new THREE.Group();
  readonly ri: number;
  readonly ro: number;
  time = 0;
  /** форма: u — раскрытие (0 круг … 1 дуга), sigma — угол разреза (между двумя дальними флаконами) */
  u = 0;
  sigma = Math.PI;
  /** параметры дуги: охват phi, радиус rho, центр по z */
  phi = TAU;
  rho: number;
  zc = 0;
  private sf = 0.5;
  private R: number;
  private reflScene = new THREE.Scene();
  private rt: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private rip: THREE.Vector4[];
  private nextRip = 0;
  private mirrors: { src: THREE.Mesh; dst: THREE.Mesh }[] = [];
  private flip = new THREE.Matrix4().makeScale(1, -1, 1);
  private petals: THREE.InstancedMesh;
  private P: Petal[] = [];
  private flow = 0; // течение воды — догоняет вращение кольца
  private stir: { x: number; z: number; vx: number; vz: number; t: number } | null = null;
  private dummy = new THREE.Object3D();
  private keep: { dispose(): void }[] = [];
  private sweeps: (Sweep | Cap)[] = [];
  private v = new THREE.Vector3();
  private plaster!: THREE.MeshStandardMaterial;
  private shadow!: THREE.MeshBasicMaterial;
  /** перетекание цветов при смене темы: from → to за ~0.7 с */
  private pal = { t: 1, from: [] as THREE.Color[], to: [] as THREE.Color[] };

  constructor(opts: { R: number; half: number; dh: number; touch: boolean; env: THREE.Texture }) {
    const { R, half, dh, touch } = opts;
    this.R = R;
    this.rho = R;
    this.ri = R - half;
    this.ro = R + half;
    const k = <T extends { dispose(): void }>(x: T) => (this.keep.push(x), x);
    const add = (s: Sweep | Cap, m: THREE.Material, order = 0) => {
      this.sweeps.push(s);
      k(s.geo);
      const mesh = new THREE.Mesh(s.geo, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.group.add(mesh);
      return mesh;
    };
    this.reflScene.environment = opts.env;

    this.rt = k(new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true }));
    this.rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));

    const SEG = 288;
    // вода — полоса между закраинами
    const wi = this.ri - 0.01 - R;
    const wo = this.ro + 0.01 - R;
    this.mat = k(
      new THREE.ShaderMaterial({
        uniforms: {
          refl: { value: this.rt.texture },
          res: { value: new THREE.Vector2(1, 1) },
          time: { value: 0 },
          rip: { value: this.rip },
          edges: { value: new THREE.Vector2(this.ri - R, this.ro - R) },
          body: { value: new THREE.Color("#f1ece5") },
          deep: { value: new THREE.Color("#ddd3cc") },
          gold: { value: new THREE.Color("#e0b56a") },
          sky: { value: new THREE.Color("#fffcf7") },
        },
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        side: THREE.DoubleSide,
      }),
    );
    add(
      new Sweep(
        Array.from({ length: 7 }, (_, i) => ({ d: wi + ((wo - wi) * i) / 6, y: 0, nd: 0, ny: 1 })),
        SEG,
        false,
      ),
      this.mat,
    );

    // гипсовый обод: внутренняя и внешняя закраина чуть выше воды, мягкие скосы; сечение замкнуто снизу
    const L = 0.24;
    const top = 0.07;
    const bot = -0.44;
    const a = this.ri - L;
    const b = this.ro + L;
    const rim: [number, number][] = (
      [
        [a + 0.02, bot],
        [a, bot + 0.03],
        [a, top - 0.04],
        [a + 0.015, top - 0.01],
        [a + 0.05, top],
        [this.ri - 0.05, top],
        [this.ri - 0.01, top - 0.02],
        [this.ri, -0.03],
        [this.ro, -0.03],
        [this.ro + 0.01, top - 0.02],
        [this.ro + 0.05, top],
        [b - 0.05, top],
        [b - 0.015, top - 0.01],
        [b, top - 0.04],
        [b, bot + 0.03],
        [b - 0.02, bot],
      ] as [number, number][]
    ).map(([x, y]) => [x - R, y]);
    const plaster = (this.plaster = k(new THREE.MeshStandardMaterial({ color: "#f6f2ec", roughness: 0.62, envMapIntensity: 1.25, side: THREE.DoubleSide })));
    add(new Sweep(polyline(rim, true), SEG, true), plaster);
    // торцы появляются, когда круг разомкнут
    add(new Cap([...rim].reverse(), 0), plaster);
    add(new Cap([...rim].reverse(), 1), plaster);

    // золотые нити по закраинам и пояс на боку
    const goldM = k(new THREE.MeshStandardMaterial({ color: "#c9a463", metalness: 1, roughness: 0.28 }));
    // на телефоне без сглаживания тонкая нить рвётся на пунктир — там она толще
    const thick = touch ? 1.8 : 1.2;
    const tube = (r: number, y: number, t: number) => {
      const pts: ProfPt[] = Array.from({ length: 10 }, (_, i) => {
        const f = (i / 10) * TAU;
        return { d: r - R + Math.cos(f) * t * thick, y: y + Math.sin(f) * t * thick, nd: Math.cos(f), ny: Math.sin(f) };
      });
      add(new Sweep(pts, 320, true), goldM);
    };
    tube(this.ri - 0.035, top - 0.005, 0.014);
    tube(this.ro + 0.035, top - 0.005, 0.014);
    tube(b + 0.004, -0.15, 0.011);

    // мягкая тень подиума на «бумаге» — полоса вдоль кривой, прозрачность — по поперечному градиенту
    const s0 = a - 1.1 - R;
    const s1 = b + 1.4 - R;
    const sc = document.createElement("canvas");
    sc.width = 256;
    sc.height = 1;
    const sx = sc.getContext("2d")!;
    const at = (d: number) => Math.min(1, Math.max(0, (d - s0) / (s1 - s0)));
    const gr = sx.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, "rgba(70,55,45,0)");
    gr.addColorStop(at(a - 0.6 - R), "rgba(70,55,45,0.06)");
    gr.addColorStop(at(0), "rgba(70,55,45,0.26)");
    gr.addColorStop(at(b + 0.25 - R), "rgba(70,55,45,0.12)");
    gr.addColorStop(1, "rgba(70,55,45,0)");
    sx.fillStyle = gr;
    sx.fillRect(0, 0, 256, 1);
    const st = k(new THREE.CanvasTexture(sc));
    st.colorSpace = THREE.SRGBColorSpace;
    const SH = 9;
    add(
      new Sweep(
        Array.from({ length: SH }, (_, i) => ({ d: s0 + ((s1 - s0) * i) / (SH - 1), y: bot - 0.005, nd: 0, ny: 1 })),
        SEG,
        false,
        (j, kk) => [kk / (SH - 1), 0.5],
      ),
      (this.shadow = k(new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))),
      -1,
    );

    // лепестки на воде — по обе стороны от ряда флаконов
    const pg = k(new THREE.PlaneGeometry(1, 1, 4, 4));
    const pos = pg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, x * x * 1.1 + (y + 0.5) * (y + 0.5) * 0.35); // лепесток выгнут чашечкой, кончик приподнят
    }
    pg.rotateX(-Math.PI / 2);
    pg.computeVertexNormals();
    const pm = k(new THREE.MeshBasicMaterial({ map: k(petalTexture()), alphaTest: 0.45, side: THREE.DoubleSide, toneMapped: false }));
    const count = touch ? 22 : 34;
    this.petals = new THREE.InstancedMesh(pg, pm, count);
    const tints = ["#eeb3b9", "#f4cfc8", "#fbf0e4", "#ecd29c", "#e297a4", "#f2d6de"];
    const inner: [number, number] = [this.ri + 0.12, R - dh - 0.1];
    const outer: [number, number] = [R + dh + 0.1, this.ro - 0.12];
    const okIn = inner[1] - inner[0] > 0.15;
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const band = !okIn || Math.random() < 0.62 ? outer : inner;
      this.P.push({
        a: Math.random() * TAU,
        r: band[0] + Math.random() * (band[1] - band[0]),
        va: 0,
        vr: 0,
        yaw: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 0.25,
        ph: Math.random() * 6.28,
        s: 0.36 + Math.random() * 0.2,
        tilt: -0.15 - Math.random() * 0.3,
        lo: band[0],
        hi: band[1],
        drift: (0.006 + Math.random() * 0.01) * (Math.random() < 0.5 ? 1 : -1),
      });
      this.petals.setColorAt(i, col.set(tints[i % tints.length]));
    }
    this.petals.frustumCulled = false;
    this.group.add(this.petals);

    this.bendAll();
    this.updatePetals(0, 0);
  }

  // ───────────────────────── тема

  /** цвета подиума: вода (верх, глубина, «небо»), гипс, тень */
  private targets() {
    const u = this.mat.uniforms;
    return [u.body.value, u.deep.value, u.sky.value, this.plaster.color, this.shadow.color] as THREE.Color[];
  }

  /** светлая тема — гипс и молочная вода; тёмная — тёмный камень, графитовая вода, тень темнее фона */
  setDark(dark: boolean, instant = false) {
    const hex = dark ? ["#34312e", "#262422", "#4b4743", "#3d3a37", "#000000"] : ["#f1ece5", "#ddd3cc", "#fffcf7", "#f6f2ec", "#ffffff"];
    const to = hex.map((h) => new THREE.Color(h));
    const cur = this.targets();
    if (instant) {
      cur.forEach((c, i) => c.copy(to[i]));
      this.pal.t = 1;
      return;
    }
    this.pal = { t: 0, from: cur.map((c) => c.clone()), to };
  }

  /** идёт перетекание цветов — нужны кадры */
  get fading() {
    return this.pal.t < 1;
  }

  // ───────────────────────── форма

  /**
   * Раскрытие: u = 0 — круг; u = 1 — дуга, охватывающая ~0.38 круга, длиннее исходного кольца на треть.
   * Перёд кольца (точка напротив зрителя) остаётся на месте, разрез — под углом sigma (сзади).
   */
  setShape(u: number, sigma: number) {
    if (u === this.u && (u === 0 || sigma === this.sigma)) return;
    this.u = u;
    this.sigma = sigma;
    this.phi = TAU * (1 - 0.62 * u);
    this.rho = (TAU * this.R * (1 + 0.32 * u)) / this.phi;
    this.zc = this.R - this.rho;
    this.sf = wrap01(-sigma / TAU);
    this.bendAll();
  }

  private bendAll() {
    this.sweeps.forEach((s) => s.bend(this));
  }

  /** доля пути от разреза → угол на дуге (0 — перёд) */
  thetaOfS(s: number) {
    return (s - this.sf) * this.phi;
  }

  /** угол на исходном круге → угол на дуге */
  theta(a: number) {
    return this.thetaOfS(wrap01((a - this.sigma) / TAU));
  }

  /** точка подиума: угол на дуге th, отступ от ряда флаконов d, высота y */
  at(th: number, d: number, y: number, out: THREE.Vector3) {
    const r = this.rho + d;
    return out.set(Math.sin(th) * r, y, this.zc + Math.cos(th) * r);
  }

  /** точка по углу на исходном круге */
  place(a: number, d: number, y: number, out: THREE.Vector3) {
    return this.at(this.theta(a), d, y, out);
  }

  // ───────────────────────── отражение, круги, лепестки

  /** отражение: все непрозрачные части флакона, отзеркаленные под воду */
  mirror(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material & { transmission?: number };
      if (Array.isArray(m.material) || mat.transparent || (mat.transmission ?? 0) > 0) return;
      const dst = new THREE.Mesh(m.geometry, m.material);
      dst.matrixAutoUpdate = false;
      dst.matrixWorldAutoUpdate = false;
      this.reflScene.add(dst);
      this.mirrors.push({ src: m, dst });
    });
  }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    this.mat.uniforms.res.value.set(w, h);
  }

  /** круг на воде; amp ≈ 0.3 (капля) … 1.3 (флакон опустили) */
  ripple(x: number, z: number, amp: number) {
    this.rip[this.nextRip].set(x, z, this.time, amp);
    this.nextRip = (this.nextRip + 1) % MAX_RIPPLES;
  }

  /** точка на воде под лучом или null */
  hit(ray: THREE.Ray, out: THREE.Vector3) {
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t <= 0) return null;
    out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
    if (this.u > 0) {
      // на дуге: отступ от её окружности и попадание в охват
      const dx = out.x;
      const dz = out.z - this.zc;
      const d = Math.hypot(dx, dz) - this.rho;
      const th = Math.atan2(dx, dz);
      return d > this.ri - this.R && d < this.ro - this.R && th > this.thetaOfS(0) && th < this.thetaOfS(1) ? out : null;
    }
    const r = Math.hypot(out.x, out.z);
    return r > this.ri && r < this.ro ? out : null;
  }

  /** мышь ведёт по воде — лепестки рядом отплывают */
  push(x: number, z: number, vx: number, vz: number) {
    this.stir = { x, z, vx, vz, t: this.time };
  }

  update(dt: number, ringVel: number) {
    this.time += dt;
    if (this.pal.t < 1) {
      this.pal.t = Math.min(1, this.pal.t + dt / 0.7);
      const e = this.pal.t * this.pal.t * (3 - 2 * this.pal.t);
      this.targets().forEach((c, i) => c.lerpColors(this.pal.from[i], this.pal.to[i], e));
    }
    this.mat.uniforms.time.value = this.time;
    this.flow += (ringVel - this.flow) * (1 - Math.exp(-dt * 1.4));
    this.updatePetals(dt, this.flow);
  }

  private updatePetals(dt: number, flow: number) {
    const s = this.stir && this.time - this.stir.t < 0.25 ? this.stir : null;
    const v = this.v;
    this.P.forEach((p, i) => {
      if (s) {
        this.place(p.a, p.r - this.R, 0, v);
        const dx = v.x - s.x;
        const dz = v.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.9) {
          const f = (1 - d / 0.9) * dt * 5;
          // толчок в сторону движения мыши и прочь от неё: поперёк и вдоль подиума
          const px = (s.vx * 0.12 + (dx / (d + 0.05)) * 0.6) * f;
          const pz = (s.vz * 0.12 + (dz / (d + 0.05)) * 0.6) * f;
          const th = this.theta(p.a);
          const rx = Math.sin(th);
          const rz = Math.cos(th);
          p.vr += px * rx + pz * rz;
          p.va += (px * rz - pz * rx) / p.r;
          p.spin += (Math.random() - 0.5) * f * 2;
        }
      }
      p.va *= Math.exp(-dt * 1.2);
      p.vr *= Math.exp(-dt * 1.6);
      p.spin *= Math.exp(-dt * 0.15);
      // на разомкнутой дуге лепестки не дрейфуют — не перескакивают с конца на конец
      const still = 1 - Math.min(1, this.u * 20);
      p.a += (flow * 0.9 + p.va + p.drift) * dt * still;
      p.r += p.vr * dt;
      if (p.r < p.lo) {
        p.r = p.lo;
        p.vr = Math.abs(p.vr) * 0.4;
      } else if (p.r > p.hi) {
        p.r = p.hi;
        p.vr = -Math.abs(p.vr) * 0.4;
      }
      p.yaw += (p.spin + flow * 0.3) * dt;
      const o = this.dummy;
      this.place(p.a, p.r - this.R, 0.012 + Math.sin(this.time * 1.3 + p.ph) * 0.006, o.position);
      o.rotation.set(p.tilt + Math.sin(this.time * 0.9 + p.ph) * 0.06, p.yaw, Math.cos(this.time * 0.8 + p.ph) * 0.06, "YXZ");
      o.scale.set(p.s * 0.78, p.s, p.s);
      o.updateMatrix();
      this.petals.setMatrixAt(i, o.matrix);
    });
    this.petals.instanceMatrix.needsUpdate = true;
  }

  /** кадр отражения — до основного кадра */
  renderReflection(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    for (const { src, dst } of this.mirrors) dst.matrixWorld.multiplyMatrices(this.flip, src.matrixWorld);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.reflScene, camera);
    renderer.setRenderTarget(prev);
  }

  dispose() {
    this.petals.dispose();
    this.keep.forEach((x) => x.dispose());
  }
}
