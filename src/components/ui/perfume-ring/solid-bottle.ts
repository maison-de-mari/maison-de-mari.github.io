import * as THREE from "three";

/**
 * Объёмный флакон из одной картинки — лёгкий, без 3D-моделей.
 * По силуэту фото строится фигура: круглый флакон — тело вращения, плоский — «выдавленный» силуэт
 * со скруглёнными рёбрами. Спереди — само фото; бока, верх и низ — цвет флакона на этой высоте
 * (взят с края фото) со светом и бликами; сзади — то же стекло, сквозь которое слабо видна этикетка.
 * Шейдер простой (без PBR и преломления) — работает так же быстро, как плоские картинки.
 */
export type SolidSpec = { kind: "round" } | { kind: "flat"; depth: number };

const ROWS = 140; // сколько срезов по высоте берём из силуэта

/** Левый и правый край силуэта на каждой высоте (доли ширины фото), сверху вниз; плюс полоска цвета края */
function readSilhouette(img: HTMLImageElement) {
  const W = 256;
  const Hh = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hh;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, Hh);
  const d = g.getImageData(0, 0, W, Hh).data;
  const rows: { y: number; l: number; r: number }[] = [];
  for (let k = 0; k <= ROWS; k++) {
    const y = Math.min(Hh - 1, Math.round((k / ROWS) * (Hh - 1)));
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 128) {
        if (l < 0) l = x;
        r = x;
      }
    if (l >= 0) rows.push({ y: k / ROWS, l: l / W, r: (r + 1) / W });
  }

  // цвет края на каждой высоте: две средние по яркости точки из четырёх у краёв (без бликов), сглажено по высоте
  const SH = 256;
  const col = new Float32Array(SH * 3);
  const ok = new Uint8Array(SH);
  for (let k = 0; k < SH; k++) {
    const y = Math.min(Hh - 1, Math.round(((SH - 1 - k) / (SH - 1)) * (Hh - 1))); // k=0 — низ
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 150) {
        if (l < 0) l = x;
        r = x;
      }
    if (l < 0) continue;
    const inset = Math.max(2, Math.round((r - l) * 0.06));
    const xs = [l + inset, l + inset * 2, r - inset, r - inset * 2].map((x) => Math.min(r, Math.max(l, x)));
    const px = xs.map((x) => [d[(y * W + x) * 4], d[(y * W + x) * 4 + 1], d[(y * W + x) * 4 + 2]]).sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    for (let ch = 0; ch < 3; ch++) col[k * 3 + ch] = (px[1][ch] + px[2][ch]) / 2;
    ok[k] = 1;
  }
  const strip = new Uint8Array(SH * 4);
  const RAD = 6;
  for (let k = 0; k < SH; k++) {
    // строки без флакона берут цвет ближайшей строки с флаконом — чтобы на скруглениях не было чёрной кромки
    let w = 0;
    const acc = [0, 0, 0];
    for (let j = -RAD * 3; j <= RAD * 3; j++) {
      const kk = k + j;
      if (kk < 0 || kk >= SH || !ok[kk]) continue;
      const g2 = Math.exp(-(j * j) / (2 * RAD * RAD));
      for (let ch = 0; ch < 3; ch++) acc[ch] += col[kk * 3 + ch] * g2;
      w += g2;
    }
    for (let ch = 0; ch < 3; ch++) strip[k * 4 + ch] = w ? Math.round(acc[ch] / w) : 0;
    strip[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(strip, 1, SH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { rows, strip: tex };
}

const vert = /* glsl */ `
varying vec3 vPos;
varying vec3 vN;
varying vec3 vViewN;
varying vec3 vViewPos;
void main(){
  vPos = position;
  vN = normal;
  vViewN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform sampler2D strip;
uniform vec4 uBox;     // x0, y0, ширина, высота фото в координатах флакона
uniform float uDim;
uniform float uFlat;   // 1 — плоский флакон (перёд — только лицевая грань), 0 — круглый
varying vec3 vPos;
varying vec3 vN;
varying vec3 vViewN;
varying vec3 vViewPos;
void main(){
  vec2 uv = clamp(vec2((vPos.x - uBox.x) / uBox.z, (vPos.y - uBox.y) / uBox.w), 0.0, 1.0);
  vec3 n = normalize(vN);
  vec3 vn = normalize(vViewN);
  vec3 v = normalize(-vViewPos);
  if (!gl_FrontFacing) vn = -vn;

  // лицевая сторона — само фото (на круглом — передняя половина, к краям сжимается как на снимке)
  float front = uFlat > 0.5 ? smoothstep(0.55, 0.85, n.z) : smoothstep(-0.05, 0.3, n.z);
  vec4 photo = texture2D(map, uv);
  // бока, верх, низ — цвет флакона на этой высоте; сзади сквозь стекло слабо видна этикетка (зеркально)
  vec3 side = texture2D(strip, vec2(0.5, uv.y)).rgb;
  vec3 backPhoto = texture2D(map, vec2(1.0 - uv.x, uv.y), 2.0).rgb;
  vec3 body = mix(side, mix(side, backPhoto, 0.3), smoothstep(-0.3, -0.7, n.z));

  // свет для боков: мягкий сверху-спереди-слева + заполняющий; блик софтбокса и светлая кромка — «стекло»
  vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
  float diff = 0.5 + 0.55 * max(dot(vn, L), 0.0);
  vec3 col = body * diff;
  vec3 h = normalize(L + v);
  float spec = pow(max(dot(vn, h), 0.0), 60.0) * 0.55;
  float rim = pow(1.0 - max(dot(vn, v), 0.0), 3.0) * 0.28;
  col += vec3(spec + rim) * (1.0 - front * 0.7);

  col = mix(col, photo.rgb, front * photo.a);
  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
}`;

export function buildSolid(img: HTMLImageElement, tex: THREE.Texture, H: number, spec: SolidSpec) {
  const aspect = img.naturalWidth / img.naturalHeight;
  const W = H * aspect;
  const { rows, strip } = readSilhouette(img);
  // координаты: x — от центра фото, y — от низа флакона
  const X = (u: number) => (u - 0.5) * W;
  const Y = (t: number) => (1 - t) * H;

  let geo: THREE.BufferGeometry;
  if (spec.kind === "round") {
    // тело вращения: радиус на каждой высоте — половина ширины силуэта
    const pts: THREE.Vector2[] = [];
    const last = rows[rows.length - 1];
    pts.push(new THREE.Vector2(0, Y(last.y)));
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      pts.push(new THREE.Vector2(Math.max(0.001, ((r.r - r.l) / 2) * W), Y(r.y)));
    }
    pts.push(new THREE.Vector2(0, Y(rows[0].y)));
    geo = new THREE.LatheGeometry(pts, 64);
  } else {
    // плоский: силуэт, выдавленный на нужную толщину, со скруглёнными рёбрами
    const shape = new THREE.Shape();
    rows.forEach((r, i) => (i === 0 ? shape.moveTo(X(r.r), Y(r.y)) : shape.lineTo(X(r.r), Y(r.y))));
    for (let i = rows.length - 1; i >= 0; i--) shape.lineTo(X(rows[i].l), Y(rows[i].y));
    shape.closePath();
    const D = W * spec.depth;
    const bevel = Math.min(D * 0.3, W * 0.05);
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, D - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 4,
      curveSegments: 4,
    });
    geo.translate(0, 0, -(D - bevel * 2) / 2);
    geo.computeVertexNormals();
  }

  const dim = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      strip: { value: strip },
      uBox: { value: new THREE.Vector4(-W / 2, 0, W, H) },
      uDim: dim,
      uFlat: { value: spec.kind === "flat" ? 1 : 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh,
    setDim(v: number) {
      dim.value = v;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      strip.dispose();
    },
  };
}
