import * as THREE from "three";

/**
 * Крышка из фотографий (приём из out-of-the-blue-3d.html): форма — тело вращения по силуэту на фото,
 * цвет — с листа из нескольких снимков флакона (спереди, вполоборота, сбоку, сзади…). Каждый пиксель берёт
 * снимок, сделанный с той стороны, откуда на флакон смотрит камера, и проецирует его на поверхность.
 * Свет и детали короны — настоящие, с фото.
 * Отличия от оригинала: стыки между снимками короче (бока не размазываются), а свет «по взгляду» считается
 * для каждого флакона отдельно — флаконы стоят на кольце под разными углами.
 */
export type PhotoCap = {
  /** лист со снимками; размеры в пикселях */
  src: string;
  sheet: [number, number];
  /** снимки: угол обзора (рад; 0 — спереди, π/2 — слева, π — сзади, 3π/2 — справа), центр снимка по X, масштаб по ширине */
  views: [number, number, number][];
  /** силуэт крышки на листе: [y, радиус] сверху вниз (пиксели) */
  rows: [number, number][];
  /** низ флакона на листе (пиксели) и высота флакона в пикселях — для перевода в единицы сцены */
  bottomPx: number;
  heightPx: number;
};

const vert = /* glsl */ `
varying vec3 vP;
varying float vYaw;
void main(){
  vP = position;
  // откуда смотрит камера — в системе координат крышки
  vec3 camObj = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vYaw = atan(-camObj.x, camObj.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function frag(n: number) {
  return /* glsl */ `
uniform sampler2D sheet;
uniform vec2 size;
uniform float k;        // пикселей листа в единице сцены
uniform float bottom;   // низ флакона на листе
uniform float ang[${n}];
uniform float cx[${n}];
uniform float ratio[${n}];
varying vec3 vP;
varying float vYaw;
vec3 view(int i, vec3 p, float y){
  float u = cx[i] + (p.x * cos(ang[i]) + p.z * sin(ang[i])) * ratio[i] * 0.975;
  return texture2D(sheet, vec2(u / size.x, 1.0 - y / size.y)).rgb;
}
void main(){
  vec3 p = vP * k;
  float y = bottom - p.y;
  float yaw = mod(vYaw + 6.2831853, 6.2831853);
  // два ближайших снимка по углу; стык — короткий плавный переход
  int a = ${n - 1};
  for (int i = 0; i < ${n}; i++) if (ang[i] <= yaw) a = i;
  int b = a == ${n - 1} ? 0 : a + 1;
  float a0 = ang[a];
  float a1 = b == 0 ? 6.2831853 : ang[b];
  float t = clamp((yaw - a0) / max(a1 - a0, 1e-3), 0.0, 1.0);
  t = smoothstep(0.3, 0.7, t);
  vec3 col = mix(view(a, p, y), view(b, p, y), t);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
}

/** Меш крышки в единицах сцены: высота флакона heightPx → HT */
export function buildPhotoCap(cap: PhotoCap, HT: number, tex: THREE.Texture) {
  const k = cap.heightPx / HT;
  const SEG = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  cap.rows.forEach(([ypx, r]) => {
    const y = (cap.bottomPx - ypx) / k;
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      pos.push((Math.sin(t) * r) / k, y, (Math.cos(t) * r) / k);
    }
  });
  for (let i = 0; i < cap.rows.length - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const views = [...cap.views].sort((x, y) => x[0] - y[0]);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      sheet: { value: tex },
      size: { value: new THREE.Vector2(cap.sheet[0], cap.sheet[1]) },
      k: { value: k },
      bottom: { value: cap.bottomPx },
      ang: { value: views.map((v) => v[0]) },
      cx: { value: views.map((v) => v[1]) },
      ratio: { value: views.map((v) => v[2]) },
    },
    vertexShader: vert,
    fragmentShader: frag(views.length),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * Корпус из фотографий — точно как в out-of-the-blue-3d.html: стекло и этикетка — со снимков листа
 * (спереди, сзади, сбоку), а жидкость считается лучом через внутреннюю полость: сколько парфюма на пути
 * взгляда, с наклонной поверхностью и волнами. Координаты шейдера — пиксели листа, как в оригинале.
 */
export type PhotoBody = {
  /** силуэт корпуса: [y, полуширина, полуглубина] сверху вниз (пиксели листа) */
  rows: [number, number, number][];
  /** «квадратность» сечения (как exp в оригинале: 1 — эллипс, меньше — прямоугольник) */
  exp: number;
};

const bodyVert = /* glsl */ `
uniform float k;
uniform float shift;
varying vec3 vP;
varying vec3 vCam;
void main(){
  vP = position * k - vec3(0.0, shift, 0.0);
  vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz * k - vec3(0.0, shift, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// фрагментный шейдер оригинала (корпус); p — точка в пикселях листа, V — направление на камеру
const bodyFrag = /* glsl */ `
uniform sampler2D pic;
uniform vec2 size;
uniform float level;
uniform vec2 slopeV;
uniform float wave;
uniform float time;
varying vec3 vP;
varying vec3 vCam;
vec3 ink(float x, float y){ return texture2D(pic, vec2(x / size.x, 1.0 - y / size.y)).rgb; }
void main(){
  vec3 p = vP;
  float y = 482.0 - p.y;
  vec3 V = normalize(vCam - p);
  vec3 f = ink(173.0 + p.x * 0.985, y), back = ink(893.0 - p.x * 0.97, y);
  vec3 side = p.x < 0.0 ? ink(669.0 + p.z * 0.96, y) : ink(1119.0 - p.z * 0.96, y);
  float face = smoothstep(0.79, 0.985, abs(p.z) / 60.0);
  vec3 photo = mix(side, p.z > 0.0 ? f : back, face);
  float label = step(0.0, p.z) * smoothstep(57.0, 59.6, p.z) * (1.0 - smoothstep(75.0, 78.0, abs(p.x))) * smoothstep(427.0, 430.0, y) * (1.0 - smoothstep(698.0, 702.0, y));
  vec3 ray = -V; ray = sign(ray + vec3(0.000001)) * max(abs(ray), vec3(0.0001));
  vec3 lo = (vec3(-99.0, -270.0, -50.0) - p) / ray, hi = (vec3(99.0, 83.0, 50.0) - p) / ray;
  vec3 a = min(lo, hi), b = max(lo, hi);
  float start = max(0.0, max(a.x, max(a.y, a.z))), end = min(b.x, min(b.y, b.z));
  vec3 color = photo;
  if (end > start) {
    vec3 nearP = p + ray * start, farP = p + ray * end;
    vec2 slope = slopeV;
    float h = level;
    float h1 = h + dot(slope, nearP.xz) + wave * sin(nearP.x * 0.038 + time) * cos(nearP.z * 0.035);
    float h2 = h + dot(slope, farP.xz) + wave * sin(farP.x * 0.038 + time) * cos(farP.z * 0.035);
    float d1 = nearP.y - h1, d2 = farP.y - h2;
    float frac = clamp(-min(d1, d2) / max(abs(d2 - d1), 0.15), 0.0, 1.0);
    float depth = (end - start) * frac;
    float m = smoothstep(-1.2, 1.2, -min(d1, d2)) * (1.0 - smoothstep(-1.2, 1.2, -max(d1, d2)));
    vec3 empty = mix(photo, vec3(0.55, 0.67, 0.89), 0.50);
    vec3 fluid = mix(vec3(0.15, 0.42, 0.76), vec3(0.026, 0.085, 0.396), 1.0 - exp(-depth * 0.026));
    fluid += 0.27 * photo + vec3(0.018, 0.035, 0.105) * exp(-abs(y - 738.0) * 0.065);
    color = mix(empty, fluid, 1.0 - exp(-depth * 0.20));
    color = mix(color, vec3(0.41, 0.65, 0.90) + photo * 0.12, 0.46 * m);
    float rim = exp(-abs(d1 + 0.4) * 0.78); color += vec3(0.42, 0.54, 0.57) * rim;
    float wall = smoothstep(0.0, 4.0, end - start);
    color = mix(photo, color, wall * 0.91);
  }
  color = mix(color, photo, label);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

export function buildPhotoBody(cap: PhotoCap, body: PhotoBody, HT: number, tex: THREE.Texture, fill: number) {
  const k = cap.heightPx / HT;
  const SEG = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  body.rows.forEach(([ypx, w, d]) => {
    const y = (cap.bottomPx - ypx) / k;
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      pos.push((w * Math.sign(c) * Math.abs(c) ** body.exp) / k, y, (d * Math.sign(s) * Math.abs(s) ** body.exp) / k);
    }
  });
  for (let i = 0; i < body.rows.length - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pic: { value: tex },
      size: { value: new THREE.Vector2(cap.sheet[0], cap.sheet[1]) },
      k: { value: k },
      // в оригинале y = 482 − p.y: переводим высоту над дном в его систему
      shift: { value: cap.bottomPx - 482 },
      level: { value: -270 + 354 * fill },
      slopeV: { value: new THREE.Vector2() },
      wave: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: bodyVert,
    fragmentShader: bodyFrag,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh,
    /** наклон поверхности в системе флакона (из физики жидкости), высота волн и время */
    update(sx: number, sz: number, amp: number, t: number) {
      mat.uniforms.slopeV.value.set(sx, sz);
      mat.uniforms.wave.value = Math.min(8, amp * k * 1.6);
      mat.uniforms.time.value = t * 4;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
