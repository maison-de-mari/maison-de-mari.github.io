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
