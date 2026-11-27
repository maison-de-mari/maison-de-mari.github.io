import * as THREE from "three";

/**
 * «Живое» кольцо под витриной: гипсовый обод цвета бумаги сайта, в нём — канал молочной воды.
 * Флаконы стоят в воде и отражаются в ней (отражение — сами флаконы, отзеркаленные под воду,
 * в отдельный кадр в полразмера; вода искажает его своими волнами).
 * Вода живая: медленная зыбь, блики, световая сетка на дне, золотой отсвет бежит по краю;
 * от мыши, вращения кольца и выбора флакона расходятся круги; по воде плывут лепестки
 * и уносятся течением, когда кольцо крутят.
 */

const MAX_RIPPLES = 20;

const waterVert = /* glsl */ `
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const waterFrag = /* glsl */ `
uniform sampler2D refl;
uniform vec2 res;
uniform float time;
uniform vec4 rip[${MAX_RIPPLES}];
uniform vec3 radii;   // внутренний край, ряд флаконов, внешний край
uniform vec3 body;
uniform vec3 deep;
uniform vec3 gold;
varying vec3 vW;
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
  float r = length(p);
  float across = clamp((r - radii.x) / (radii.z - radii.x), 0.0, 1.0);
  // глубже к середине канала — чуть темнее и теплее
  vec3 c = mix(body, deep, sin(across * 3.14159) * 0.75);
  c += vec3(1.0, 0.97, 0.9) * 0.1 * caustic(p + n.xz * 0.8);
  // гребни кругов чуть светлее — круги видны и без отражения
  c += vec3(1.0, 0.99, 0.96) * clamp(ripples(p) * 6.0, -0.05, 0.12);
  // отражение флаконов, искажённое волнами
  vec4 rf = texture2D(refl, gl_FragCoord.xy / res + n.xz * 0.09);
  c = mix(c, rf.rgb, rf.a * mix(0.5, 0.92, fres));
  // небо (светлая бумага) у пологих взглядов
  c = mix(c, vec3(1.0, 0.99, 0.97), fres * 0.45 * (1.0 - rf.a));
  // блики
  vec3 L = normalize(vec3(-0.35, 0.5, -1.0));
  float s = max(dot(reflect(-V, n), L), 0.0);
  c += vec3(1.0, 0.98, 0.94) * (pow(s, 260.0) * 1.2 + pow(s, 26.0) * 0.07);
  // два золотых отсвета бегут вдоль краёв навстречу друг другу
  float ang = atan(p.x, p.y);
  float a1 = wrapA(ang - time * 0.21), a2 = wrapA(ang + time * 0.13 + 2.0);
  float edge = exp(-(radii.z - r) * 5.0) + exp(-(r - radii.x) * 5.0);
  c += gold * (exp(-a1 * a1 * 5.0) + 0.6 * exp(-a2 * a2 * 8.0)) * edge * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

type Petal = { a: number; r: number; va: number; vr: number; yaw: number; spin: number; ph: number; s: number; tilt: number; lo: number; hi: number; drift: number };

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

export class LivingRing {
  readonly group = new THREE.Group();
  readonly ri: number;
  readonly ro: number;
  time = 0;
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

  constructor(opts: { R: number; half: number; dh: number; touch: boolean; env: THREE.Texture }) {
    const { R, half, dh, touch } = opts;
    this.R = R;
    this.ri = R - half;
    this.ro = R + half;
    const k = <T extends { dispose(): void }>(x: T) => (this.keep.push(x), x);
    this.reflScene.environment = opts.env;

    this.rt = k(new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true }));
    this.rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));

    // вода
    this.mat = k(
      new THREE.ShaderMaterial({
        uniforms: {
          refl: { value: this.rt.texture },
          res: { value: new THREE.Vector2(1, 1) },
          time: { value: 0 },
          rip: { value: this.rip },
          radii: { value: new THREE.Vector3(this.ri, R, this.ro) },
          body: { value: new THREE.Color("#f1ece5") },
          deep: { value: new THREE.Color("#ddd3cc") },
          gold: { value: new THREE.Color("#e0b56a") },
        },
        vertexShader: waterVert,
        fragmentShader: waterFrag,
      }),
    );
    const water = new THREE.Mesh(k(new THREE.RingGeometry(this.ri - 0.01, this.ro + 0.01, 288, 6)), this.mat);
    water.rotation.x = -Math.PI / 2;
    this.group.add(water);

    // гипсовый обод: внутренняя и внешняя закраина чуть выше воды, мягкие скосы
    const L = 0.24;
    const top = 0.07;
    const bot = -0.44;
    const a = this.ri - L;
    const b = this.ro + L;
    const prof = [
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
    ].map(([x, y]) => new THREE.Vector2(x, y));
    // двусторонний материал — освещение верное, в какую сторону ни смотрят грани тела вращения
    const plaster = k(new THREE.MeshStandardMaterial({ color: "#f6f2ec", roughness: 0.62, envMapIntensity: 1.25, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(k(new THREE.LatheGeometry(prof, 256)), plaster);
    this.group.add(rim);

    // золотые нити по закраинам и пояс на боку
    const goldM = k(new THREE.MeshStandardMaterial({ color: "#c9a463", metalness: 1, roughness: 0.28 }));
    // на телефоне без сглаживания тонкая нить рвётся на пунктир — там она толще
    const thick = touch ? 1.8 : 1.2;
    const torus = (r: number, y: number, t: number) => {
      const m = new THREE.Mesh(k(new THREE.TorusGeometry(r, t * thick, 10, 320)), goldM);
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      this.group.add(m);
    };
    torus(this.ri - 0.035, top - 0.005, 0.014);
    torus(this.ro + 0.035, top - 0.005, 0.014);
    torus(b + 0.004, -0.15, 0.011);

    // мягкая тень кольца на «бумаге»
    const sc = document.createElement("canvas");
    sc.width = sc.height = 512;
    const sx = sc.getContext("2d")!;
    const Rmax = b + 1.4;
    const gr = sx.createRadialGradient(256, 256, 0, 256, 256, 256);
    const at = (r: number) => Math.min(1, Math.max(0, r / Rmax));
    gr.addColorStop(0, "rgba(70,55,45,0)");
    gr.addColorStop(at(a - 0.9), "rgba(70,55,45,0)");
    gr.addColorStop(at(R), "rgba(70,55,45,0.26)");
    gr.addColorStop(at(b + 0.25), "rgba(70,55,45,0.12)");
    gr.addColorStop(1, "rgba(70,55,45,0)");
    sx.fillStyle = gr;
    sx.fillRect(0, 0, 512, 512);
    const st = k(new THREE.CanvasTexture(sc));
    st.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      k(new THREE.PlaneGeometry(Rmax * 2, Rmax * 2)),
      k(new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = bot - 0.005;
    floor.renderOrder = -1;
    this.group.add(floor);

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
        a: Math.random() * Math.PI * 2,
        r: band[0] + Math.random() * (band[1] - band[0]),
        va: 0,
        vr: 0,
        yaw: Math.random() * Math.PI * 2,
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
    this.updatePetals(0, 0);
  }

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
    const r = Math.hypot(out.x, out.z);
    return r > this.ri && r < this.ro ? out : null;
  }

  /** мышь ведёт по воде — лепестки рядом отплывают */
  push(x: number, z: number, vx: number, vz: number) {
    this.stir = { x, z, vx, vz, t: this.time };
  }

  update(dt: number, ringVel: number) {
    this.time += dt;
    this.mat.uniforms.time.value = this.time;
    this.flow += (ringVel - this.flow) * (1 - Math.exp(-dt * 1.4));
    this.updatePetals(dt, this.flow);
  }

  private updatePetals(dt: number, flow: number) {
    const s = this.stir && this.time - this.stir.t < 0.25 ? this.stir : null;
    this.P.forEach((p, i) => {
      if (s) {
        const x = Math.sin(p.a) * p.r;
        const z = Math.cos(p.a) * p.r;
        const dx = x - s.x;
        const dz = z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.9) {
          const f = (1 - d / 0.9) * dt * 5;
          // толчок в сторону движения мыши и прочь от неё: радиально и вдоль кольца
          const px = (s.vx * 0.12 + (dx / (d + 0.05)) * 0.6) * f;
          const pz = (s.vz * 0.12 + (dz / (d + 0.05)) * 0.6) * f;
          const rx = Math.sin(p.a);
          const rz = Math.cos(p.a);
          p.vr += px * rx + pz * rz;
          p.va += (px * rz - pz * rx) / p.r;
          p.spin += (Math.random() - 0.5) * f * 2;
        }
      }
      p.va *= Math.exp(-dt * 1.2);
      p.vr *= Math.exp(-dt * 1.6);
      p.spin *= Math.exp(-dt * 0.15);
      p.a += (flow * 0.9 + p.va + p.drift) * dt;
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
      o.position.set(Math.sin(p.a) * p.r, 0.012 + Math.sin(this.time * 1.3 + p.ph) * 0.006, Math.cos(p.a) * p.r);
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
