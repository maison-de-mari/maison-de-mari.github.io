import * as THREE from "three";
import type { PhotoBottleData } from "@/data/photo-bottles";

/**
 * Фото-флакон — приём из out-of-the-blue-3d.html для любого аромата: форма — по силуэтам на снимках
 * спереди и сбоку, цвет — со снимка той стороны, откуда смотрит камера (спереди, сбоку, сзади),
 * жидкость — расчётом луча через полость с наклонной поверхностью и волнами (только там, где у флакона
 * стекло — по карте стекла). Без прозрачных материалов и второго прохода — лёгкий.
 */

const vert = /* glsl */ `
attribute vec2 nrm;
uniform float k;
varying vec3 vP;
varying vec2 vN;
varying vec3 vCam;
void main(){
  vP = position * k;
  vN = nrm;
  vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz * k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D pic;
uniform sampler2D gmap;
uniform vec2 size;
uniform vec2 vf;
uniform vec2 vs;
uniform vec2 vb;
uniform vec4 cav;
uniform float hasCav;
uniform float level;
uniform vec2 slopeV;
uniform float wave;
uniform float time;
uniform vec3 liq;
uniform vec2 faceRange;
uniform float round;
varying vec3 vP;
varying vec2 vN;
varying vec3 vCam;
vec2 at(float x, float y){ return vec2(x / size.x, 1.0 - y / size.y); }
void main(){
  vec3 p = vP;
  float y = size.y - p.y;
  vec2 uf = at(vf.x + p.x * vf.y, y);
  vec2 ub = at(vb.x - p.x * vb.y, y);
  vec2 us = at(p.x < 0.0 ? vs.x + p.z * vs.y : vs.x - p.z * vs.y, y);
  // где брать снимок спереди/сзади, а где — сбоку (у круглых — шире: этикетка огибает цилиндр)
  float face = smoothstep(faceRange.x, faceRange.y, abs(vN.y));
  vec2 uo = p.z > 0.0 ? uf : ub;
  // смещение мип-уровня: маленький флакон берёт более чёткую копию снимка (иначе на узком экране — мыло)
  vec3 photo = mix(texture2D(pic, us, -1.0).rgb, texture2D(pic, uo, -1.0).rgb, face);
  float g = mix(texture2D(gmap, us).r, texture2D(gmap, uo).r, face);
  vec3 color = photo;
  if (hasCav > 0.5 && g > 0.01) {
    vec3 V = normalize(vCam - p);
    vec3 ray = -V; ray = sign(ray + vec3(0.000001)) * max(abs(ray), vec3(0.0001));
    vec3 lo = (vec3(-cav.x, cav.y, -cav.z) - p) / ray, hi = (vec3(cav.x, cav.w, cav.z) - p) / ray;
    vec3 a = min(lo, hi), b = max(lo, hi);
    float t0 = max(a.x, a.z), t1 = min(b.x, b.z);
    if (round > 0.5) {
      // у круглых флаконов полость — эллиптический цилиндр: к краям путь сквозь парфюм плавно короче
      vec2 o = p.xz / cav.xz, dd = ray.xz / cav.xz;
      float A = dot(dd, dd), B = dot(o, dd), C = dot(o, o) - 1.0, disc = B * B - A * C;
      t0 = 1.0; t1 = 0.0;
      if (disc > 0.0) { float q = sqrt(disc); t0 = (-B - q) / A; t1 = (-B + q) / A; }
    }
    float start = max(0.0, max(t0, a.y)), end = min(t1, b.y);
    if (end > start) {
      vec3 nearP = p + ray * start, farP = p + ray * end;
      float h1 = level + dot(slopeV, nearP.xz) + wave * sin(nearP.x * 0.038 + time) * cos(nearP.z * 0.035);
      float h2 = level + dot(slopeV, farP.xz) + wave * sin(farP.x * 0.038 + time) * cos(farP.z * 0.035);
      float d1 = nearP.y - h1, d2 = farP.y - h2;
      float len = end - start;
      float frac = clamp(-min(d1, d2) / max(abs(d2 - d1), 0.15), 0.0, 1.0);
      // на снимке флакон полный: ниже уровня — ровно снимок, выше — пустое стекло (светлее, с оттенком парфюма).
      // уровень — у верха полости, так что пустой клин появляется только при наклоне
      float full = smoothstep(0.0, 1.0, frac);
      vec3 empty = mix(photo, mix(liq, vec3(1.0), 0.7), 0.3);
      vec3 c = mix(empty, photo, full);
      // поверхность, если видна сквозь стекло, и светлая линия мениска у стенки
      // поверхность и мениск видны только пока жидкость качается — в покое флакон ровно как на снимке
      float moving = clamp(length(slopeV) * 6.0 + wave * 0.5, 0.0, 1.0);
      float m = smoothstep(-1.2, 1.2, -min(d1, d2)) * (1.0 - smoothstep(-1.2, 1.2, -max(d1, d2)));
      c = mix(c, mix(liq, vec3(1.0), 0.5), 0.25 * m * moving);
      c += mix(liq, vec3(1.0), 0.6) * 0.3 * exp(-abs(d1 + 0.4) * 0.78) * moving;
      color = mix(photo, c, smoothstep(0.0, cav.z * 0.9, len) * clamp(g * 1.8, 0.0, 1.0));
    }
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

function blob(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPhotoBottle(d: PhotoBottleData, HT: number, pic: THREE.Texture, gmap: THREE.Texture) {
  const HS = d.size[1];
  const k = HS / HT;
  const SEG = 72;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  d.rows.forEach(([ypx, w, dd]) => {
    const y = (HS - ypx) / k;
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const cx = Math.sign(c) * Math.abs(c) ** d.exp;
      const sz = Math.sign(s) * Math.abs(s) ** d.exp;
      pos.push((w * cx) / k, y, (dd * sz) / k);
      nrm.push(cx, sz);
    }
  });
  for (let i = 0; i < d.rows.length - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("nrm", new THREE.Float32BufferAttribute(nrm, 2));
  geo.setIndex(idx);
  const cav = d.cavity ?? [0, 0, 0, 0];
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pic: { value: pic },
      gmap: { value: gmap },
      size: { value: new THREE.Vector2(d.size[0], HS) },
      k: { value: k },
      vf: { value: new THREE.Vector2(...d.front) },
      vs: { value: new THREE.Vector2(...d.side) },
      vb: { value: new THREE.Vector2(...d.back) },
      cav: { value: new THREE.Vector4(...cav) },
      hasCav: { value: d.cavity ? 1 : 0 },
      // в покое парфюм до верха полости — без светлой полосы над уровнем
      level: { value: cav[3] + 1 },
      slopeV: { value: new THREE.Vector2() },
      wave: { value: 0 },
      time: { value: 0 },
      liq: { value: new THREE.Vector3(...d.liquid) },
      round: { value: d.exp >= 0.99 ? 1 : 0 },
      faceRange: { value: d.exp >= 0.99 ? new THREE.Vector2(0.42, 0.62) : new THREE.Vector2(0.79, 0.985) },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);

  const maxW = Math.max(...d.rows.map((r) => r[1])) / k;
  const maxD = Math.max(...d.rows.map((r) => r[2])) / k;
  const scene = new THREE.Scene();
  const bottle = new THREE.Group();
  bottle.add(mesh);
  scene.add(bottle);
  const shTex = blob([[0, "rgba(40,30,20,0.4)"], [0.45, "rgba(40,30,20,0.15)"], [1, "rgba(40,30,20,0)"]]);
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, toneMapped: false });
  const shGeo = new THREE.PlaneGeometry(maxW * 5, maxD * 4.6 + 1);
  const shadow = new THREE.Mesh(shGeo, shMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.3, 0.002, -0.2);
  scene.add(shadow);

  // движение — как у стеклянных: наклон пружиной, поверхность горизонтальна в мире и раскачивается
  const st = { yaw: 0, yawV: 0, tx: 0, tz: 0, ttx: 0, ttz: 0, vtx: 0, vtz: 0, ptx: 0, ptz: 0, wx: 0, wz: 0, vx: 0, vz: 0, amp: 0, T: 0 };
  const qi = new THREE.Quaternion();
  const nl = new THREE.Vector3();
  function step(dt: number) {
    st.T += dt;
    st.vtx += (90 * (st.ttx - st.tx) - 13 * st.vtx) * dt;
    st.tx += st.vtx * dt;
    st.vtz += (90 * (st.ttz - st.tz) - 13 * st.vtz) * dt;
    st.tz += st.vtz * dt;
    st.wx += Math.tan(st.tz) - Math.tan(st.ptz);
    st.wz -= Math.tan(st.tx) - Math.tan(st.ptx);
    st.ptx = st.tx;
    st.ptz = st.tz;
    st.vx += (-58 * st.wx - 2.6 * st.vx) * dt;
    st.vz += (-58 * st.wz - 2.6 * st.vz) * dt;
    st.wx += st.vx * dt;
    st.wz += st.vz * dt;
    st.amp += (Math.min(0.03, Math.hypot(st.vx, st.vz) * 0.012) - st.amp) * Math.min(1, dt * 4);
    bottle.rotation.set(st.tx, st.yaw, st.tz, "XZY");
    bottle.position.y = Math.min(maxW, maxD) * Math.sin(Math.min(1, Math.hypot(st.tx, st.tz))) * 0.6;
    bottle.updateMatrixWorld();
    qi.copy(bottle.quaternion).invert();
    nl.set(-st.wx, 1, -st.wz).normalize().applyQuaternion(qi);
    let sx = -nl.x / nl.y;
    let sz = -nl.z / nl.y;
    const m = Math.hypot(sx, sz);
    if (m > 0.62) {
      sx *= 0.62 / m;
      sz *= 0.62 / m;
    }
    mat.uniforms.slopeV.value.set(sx, sz);
    mat.uniforms.wave.value = Math.min(8, st.amp * k * 1.6);
    mat.uniforms.time.value = st.T * 4;
  }
  const energy = () =>
    Math.abs(st.vtx) + Math.abs(st.vtz) + Math.abs(st.vx) + Math.abs(st.vz) + Math.abs(st.wx) * 4 + Math.abs(st.wz) * 4 +
    Math.abs(st.ttx - st.tx) + Math.abs(st.ttz - st.tz) + st.amp * 10;
  step(0.016);
  return {
    scene,
    state: st,
    size: { a: maxW, b: maxD },
    width: maxW * 2,
    step,
    energy,
    dispose() {
      geo.dispose();
      mat.dispose();
      shGeo.dispose();
      shMat.dispose();
      shTex.dispose();
    },
  };
}
