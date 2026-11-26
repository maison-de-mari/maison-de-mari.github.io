"use client";

/**
 * Стеклянный флакон Maison De Mari — CSS 3D, без WebGL.
 * Форма собирается по настройкам (как у настоящего флакона): корпус — цилиндр или коробка со скошенными
 * рёбрами, горлышко, воротничок, крышка (цилиндр, коробка или купол). Стекло прозрачное, с толстым дном;
 * внутри — отдельный объём парфюма с отчётливой поверхностью. Курсор слегка наклоняет и поворачивает флакон,
 * поверхность жидкости отстаёт и плавно (с лёгким колебанием) возвращается к горизонтали; свет на гранях
 * стекла и крышки — неподвижный, блики бегут по граням при повороте. Этикетка на круглом флаконе огибает стекло.
 *
 * Настройки: color — цвет парфюма, fill — уровень (0…1, по умолчанию 0.75), label — картинка этикетки,
 * shape — форма (см. BottleShape), size — высота флакона в px.
 * Касания не перехватываются: на телефоне витрина и страница свободно листаются пальцем.
 */

import { useEffect, useMemo, useRef, type RefObject } from "react";

/** Отделка: стекло, металлы, лак/пластик или любой CSS-цвет (#rrggbb) */
export type Finish = "glass" | "gold" | "silver" | "black" | "white" | `#${string}`;

/** Часть флакона над корпусом. top/bottom — доли высоты фото сверху, width — доля ширины фото */
export type BottlePart = {
  kind: "round" | "rect" | "dome";
  top: number;
  bottom: number;
  width: number;
  /** глубина в долях ширины (у круглых — 1) */
  depth?: number;
  finish: Finish;
};

export type BottleShape = {
  /** ширина / высота флакона на фото анфас (с крышкой) */
  aspect: number;
  /** корпус: от top (доля высоты сверху) до низа; ширина — доля ширины фото; depth — глубина в долях ширины */
  body: { kind: "round" | "rect"; top: number; width?: number; depth?: number; cut?: number };
  /** горлышко, воротничок, крышка — в любом порядке */
  parts: BottlePart[];
  /** где на фото этикетка: доли ширины и высоты (x0, y0, x1, y1) */
  label?: [number, number, number, number];
};

export type GlassBottleProps = {
  color: string;
  fill?: number;
  label?: string;
  labelAlt?: string;
  shape?: BottleShape;
  /** высота флакона, px */
  size?: number;
  scroller?: RefObject<HTMLElement | null>;
  hoverArea?: RefObject<HTMLElement | null>;
  className?: string;
};

/** Восьмигранный флакон из исходной разметки — форма по умолчанию */
export const OCTAGON: BottleShape = {
  aspect: 0.62,
  body: { kind: "rect", top: 0.34, width: 1, depth: 0.52, cut: 0.2 },
  parts: [
    { kind: "rect", top: 0, bottom: 0.25, width: 0.5, depth: 0.71, finish: "gold" },
    { kind: "rect", top: 0.25, bottom: 0.34, width: 0.29, depth: 0.75, finish: "gold" },
  ],
  label: [0.15, 0.5, 0.85, 0.8],
};

const DEG = Math.PI / 180;
const M = 30; // запас грани жидкости над поверхностью — под наклон (u)
const LIGHT = Math.atan2(-0.55, 0.85); // свет спереди-слева (угол нормали, на которую он падает прямо)

type V = [number, number];
type Face = { L: number; cx: number; cz: number; phi: number; x0: number; x1: number; ang: number };

/** Контур сечения (x, z): круг/эллипс или прямоугольник со скошенными углами */
function outline(kind: "round" | "rect", w: number, d: number, cut = 0, n = 16): V[] {
  if (kind === "round") return Array.from({ length: n }, (_, i) => [(Math.cos((i / n) * Math.PI * 2) * w) / 2, (Math.sin((i / n) * Math.PI * 2) * d) / 2]);
  const c = Math.min(w, d) * cut;
  const hw = w / 2;
  const hd = d / 2;
  return [
    [hw, hd - c], [hw, -hd + c], [hw - c, -hd], [-hw + c, -hd],
    [-hw, -hd + c], [-hw, hd - c], [-hw + c, hd], [hw - c, hd],
  ];
}

/** Грани призмы по контуру: длина, центр, поворот; x0/x1 — X левого и правого края (для среза жидкости) */
function faces(pts: V[]): Face[] {
  return pts.map((a, i) => {
    let p = a;
    let q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    let ex = q[0] - p[0];
    let ez = q[1] - p[1];
    // нормаль (CSS rotateY): (−ez, ex)/L — должна смотреть наружу
    if (-ez * mx + ex * mz < 0) {
      [p, q] = [q, p];
      ex = -ex;
      ez = -ez;
    }
    const L = Math.hypot(ex, ez);
    const phi = Math.atan2(-ez, ex);
    return { L, cx: mx, cz: mz, phi, x0: p[0], x1: q[0], ang: Math.atan2(-ez / L, ex / L) };
  });
}

const FIN: Record<string, [string, string, string, number]> = {
  // тень, цвет, блик, острота блика
  gold: ["#7c5826", "#d6b06a", "#fff4d8", 7],
  silver: ["#6d7178", "#c4c8ce", "#ffffff", 7],
  black: ["#050506", "#1c1b1f", "#77767d", 3],
  white: ["#b8b3ab", "#efebe5", "#ffffff", 2],
};
function finishColors(f: Finish): [string, string, string, number] {
  if (FIN[f]) return FIN[f];
  return [mixHex(f, "#000000", 0.45), f, mixHex(f, "#ffffff", 0.6), 3];
}
function hexRgb(h: string) {
  const v = parseInt(h.replace("#", "").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixHex(a: string, b: string, t: number) {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return "#" + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("");
}
function mixRgb(a: string, b: string, t: number) {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * t)).join(" ")})`;
}

/** Освещённость грани при повороте флакона на yaw: 0…1 (рассеянный) и блик */
function light(ang: number, yaw: number, sharp: number) {
  const d = Math.cos(ang + yaw * DEG - LIGHT);
  const diff = Math.max(0, d);
  return { diff, spec: Math.pow(diff, sharp * 6) };
}

export function GlassBottle({
  color,
  fill = 0.75,
  label,
  labelAlt = "",
  shape = OCTAGON,
  size = 220,
  scroller,
  hoverArea,
  className,
}: GlassBottleProps) {
  const scene = useRef<HTMLDivElement>(null);
  const bottle = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);

  // вся геометрия — в единицах u: высота флакона 100u
  const u = size / 100;
  const W = shape.aspect * 100;
  const b = shape.body;
  const bw = (b.width ?? 1) * W;
  const bd = bw * (b.kind === "round" ? (b.depth ?? 1) : (b.depth ?? 0.55));
  const bodyTop = b.top * 100;
  const bodyH = 100 - bodyTop;
  const wall = Math.min(bw, bd) * 0.07;
  const base = bodyH * 0.11; // толстое дно
  const innerTop = bodyTop + Math.max(2, wall * 0.6);
  const innerFloor = 100 - base;
  const f = Math.min(1, Math.max(0, fill));
  const liquidH = f * (innerFloor - innerTop);
  const level = innerFloor - liquidH;

  const geo = useMemo(() => {
    const body = outline(b.kind, bw, bd, b.cut ?? 0.12, 16);
    const inner = outline(b.kind, bw - wall * 2, bd - wall * 2, b.cut ?? 0.12, 12);
    const parts = shape.parts.map((p) => {
      const pw = p.width * W;
      const pd = pw * (p.depth ?? (p.kind === "rect" ? 0.7 : 1));
      return { p, pw, pd, pts: outline(p.kind === "rect" ? "rect" : "round", pw, pd, 0.08, 12) };
    });
    return { body, inner, parts, bodyFaces: faces(body), innerFaces: faces(inner) };
  }, [b.kind, b.cut, bw, bd, wall, shape.parts, W]);

  useEffect(() => {
    const el = scene.current;
    const area = hoverArea?.current ?? el;
    if (!el || !area) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // грани, которым нужен свет и срез, — по data-атрибутам из разметки
    const num = (n: HTMLElement, k: string) => Number(n.dataset[k]);
    const liquid = [...el.querySelectorAll<HTMLElement>("[data-liq]")].map((n) => ({ el: n, x0: num(n, "x0"), x1: num(n, "x1"), ang: num(n, "ang") }));
    const glass = [...el.querySelectorAll<HTMLElement>("[data-glass]")].map((n) => ({ el: n, ang: num(n, "ang") }));
    const metal = [...el.querySelectorAll<HTMLElement>("[data-fin]")].map((n) => ({
      el: n,
      ang: num(n, "ang"),
      fin: n.dataset.fin!.split("|") as [string, string, string, string],
    }));

    const st = { lean: 0, leanV: 0, yaw: -22, yawV: 0, pitch: -10, pitchV: 0, rel: 0, relV: 0 };
    const tgt = { px: 0, py: 0, push: 0 };
    let raf = 0;
    let last = 0;
    let litYaw = NaN; // при каком повороте последний раз считали свет
    let onScreen = true;

    const draw = () => {
      bottle.current!.style.transform = `rotateX(${st.pitch.toFixed(2)}deg) rotateY(${st.yaw.toFixed(2)}deg) rotateZ(${st.lean.toFixed(2)}deg)`;
      // жидкость: верх каждой грани срезан по поверхности, повёрнутой относительно флакона на rel
      const t = Math.tan(st.rel * DEG);
      for (const fc of liquid) {
        const yl = (M + t * fc.x0) * u;
        const yr = (M + t * fc.x1) * u;
        fc.el.style.clipPath = `polygon(0 ${yl.toFixed(1)}px, 100% ${yr.toFixed(1)}px, 100% 100%, 0 100%)`;
      }
      surface.current!.style.transform = `translateY(${(level - bodyTop) * u}px) rotateZ(${st.rel.toFixed(2)}deg) rotateX(90deg) scaleX(${(1 / Math.cos(st.rel * DEG)).toFixed(4)})`;
      // свет зависит только от поворота: при прокрутке и раскачивании жидкости его не пересчитываем
      if (Math.abs(st.yaw - litYaw) < 0.4) return;
      litYaw = st.yaw;
      for (const fc of liquid) {
        const { diff } = light(fc.ang, st.yaw, 1);
        fc.el.style.setProperty("--sh", (0.42 - diff * 0.4).toFixed(2));
      }
      // стекло: блик софтбокса бежит по граням
      for (const fc of glass) {
        const { diff, spec } = light(fc.ang, st.yaw, 1.4);
        fc.el.style.setProperty("--lit", (0.05 + diff * 0.12 + spec * 0.55).toFixed(2));
      }
      for (const m of metal) {
        const [lo, mid, hi, sharp] = m.fin;
        const { diff, spec } = light(m.ang, st.yaw, Number(sharp));
        const base = diff < 0.5 ? mixRgb(lo, mid, diff * 2) : mixRgb(mid, hi, Math.min(1, (diff - 0.5) * 2 * 0.35 + spec * 0.9));
        m.el.style.backgroundColor = base;
      }
    };

    const spring = (x: number, v: number, to: number, k: number, z: number, dt: number) => {
      const c = 2 * Math.sqrt(k) * z;
      v += (k * (to - x) - c * v) * dt;
      return [x + v * dt, v];
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      tgt.push *= Math.exp(-dt * 3);
      const leanTo = tgt.px * 9 + tgt.push;
      [st.lean, st.leanV] = spring(st.lean, st.leanV, leanTo, 70, 0.85, dt);
      [st.yaw, st.yawV] = spring(st.yaw, st.yawV, -22 + tgt.px * 34, 40, 1, dt);
      [st.pitch, st.pitchV] = spring(st.pitch, st.pitchV, -10 - tgt.py * 7, 40, 1, dt);
      [st.rel, st.relV] = spring(st.rel, st.relV, -st.lean, 38, 0.2, dt);
      st.rel = Math.max(-28, Math.min(28, st.rel));
      draw();
      const busy =
        Math.abs(st.leanV) + Math.abs(st.yawV) + Math.abs(st.pitchV) + Math.abs(st.relV) > 0.05 ||
        Math.abs(st.lean - leanTo) + Math.abs(st.rel + st.lean) + Math.abs(tgt.push) > 0.05;
      if (busy) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!raf && !reduce) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // на телефоне — только прокрутка, касания не трогаем
      const r = el.getBoundingClientRect();
      tgt.px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
      tgt.py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
      kick();
    };
    const onLeave = () => {
      tgt.px = tgt.py = 0;
      kick();
    };
    area.addEventListener("pointermove", onMove, { passive: true });
    area.addEventListener("pointerleave", onLeave, { passive: true });

    // на телефоне при прокрутке ничего не пересчитываем: прокрутка пальцем важнее раскачивания жидкости
    const sc = window.matchMedia("(pointer: coarse)").matches ? undefined : scroller?.current;
    let lastX = sc?.scrollLeft ?? 0;
    let lastT = performance.now();
    const onScroll = () => {
      // флаконы за краем экрана не раскачиваем — их всё равно не видно
      if (!sc || !onScreen) return;
      const now = performance.now();
      const v = (sc.scrollLeft - lastX) / Math.max(8, now - lastT);
      lastX = sc.scrollLeft;
      lastT = now;
      tgt.push = Math.max(-12, Math.min(12, tgt.push - v * 5));
      kick();
    };
    sc?.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting));
    io.observe(el);

    draw();
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      sc?.removeEventListener("scroll", onScroll);
    };
  }, [u, level, bodyTop, hoverArea, scroller, geo]);

  // ── разметка
  const px = (v: number) => `${(v * u).toFixed(2)}px`;

  const faceStyle = (fc: Face, h: number, top = 0): React.CSSProperties => ({
    left: `calc(50% - ${px(fc.L / 2 + 0.15)})`,
    top: px(top),
    width: px(fc.L + 0.3),
    height: px(h),
    transform: `translate3d(${px(fc.cx)}, 0, ${px(fc.cz)}) rotateY(${fc.phi.toFixed(4)}rad)`,
  });
  const poly = (pts: V[], w: number, d: number) =>
    `polygon(${pts.map(([x, z]) => `${(((x + w / 2) / w) * 100).toFixed(2)}% ${(((z + d / 2) / d) * 100).toFixed(2)}%`).join(", ")})`;
  const plate = (pts: V[], w: number, d: number, y: number, cls: string, style?: React.CSSProperties) => (
    <b
      className={`gb-plate ${cls}`}
      style={{
        left: `calc(50% - ${px(w / 2)})`,
        top: px(y - d / 2),
        width: px(w),
        height: px(d),
        clipPath: poly(pts, w, d),
        ...style,
      }}
    />
  );

  // этикетка: на круглом корпусе — полосками по дуге, на плоском — одной пластиной на передней грани
  const lab = shape.label;
  let labelEl: React.ReactNode = null;
  if (label && lab) {
    const x0 = (lab[0] - 0.5) * W;
    const x1 = (lab[2] - 0.5) * W;
    const y0 = lab[1] * 100;
    const y1 = lab[3] * 100;
    if (b.kind === "round") {
      const K = 7;
      const ax = bw / 2 + 0.4;
      const az = bd / 2 + 0.4;
      const lim = (bw / 2) * 0.93;
      const xs = Array.from({ length: K + 1 }, (_, k) => Math.max(-lim, Math.min(lim, x0 + ((x1 - x0) * k) / K)));
      const pts: V[] = xs.map((x) => [x, az * Math.sqrt(Math.max(0, 1 - (x / ax) ** 2))]);
      let acc = 0;
      const segs = pts.slice(0, -1).map((p, k) => {
        const q = pts[k + 1];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const s = { p, q, L, off: acc };
        acc += L;
        return s;
      });
      labelEl = segs.map((s, k) => {
        const fc = faces([s.p, s.q])[0];
        return (
          <span
            key={k}
            className="gb-label"
            role={k === 0 ? "img" : undefined}
            aria-label={k === 0 ? labelAlt : undefined}
            style={{
              ...faceStyle({ ...fc, L: s.L }, y1 - y0, y0 - bodyTop),
              backgroundImage: `url(${label})`,
              backgroundSize: `${px(acc)} 100%`,
              backgroundPosition: `-${px(s.off)} 0`,
              // к краям этикетка уходит в тень, как бумага на цилиндре
              boxShadow: `inset 0 0 0 999px rgb(0 0 0 / ${((Math.abs(fc.cx) / (bw / 2)) ** 2 * 0.22).toFixed(3)})`,
            }}
          />
        );
      });
    } else {
      labelEl = (
        <span
          className="gb-label"
          role="img"
          aria-label={labelAlt}
          style={{
            left: `calc(50% + ${px(x0)})`,
            top: px(y0 - bodyTop),
            width: px(x1 - x0),
            height: px(y1 - y0),
            backgroundImage: `url(${label})`,
            backgroundSize: "100% 100%",
            transform: `translateZ(${px(bd / 2 + 0.4)})`,
          }}
        />
      );
    }
  }

  const vars = {
    "--u": `${u}px`,
    "--liquid": color,
    "--liquid-hi": mixHex(color.startsWith("#") ? color : "#c8a060", "#ffffff", 0.25),
    width: px(W),
    height: px(100),
  } as React.CSSProperties;

  return (
    <div ref={scene} className={`gb-scene ${className ?? ""}`} style={vars}>
      <div ref={bottle} className="gb-bottle">
        <i className="gb-shadow" style={{ width: px(bw * 1.5), height: px(bd * 1.6), left: `calc(50% - ${px(bw * 0.75)})`, top: px(100 - bd * 0.8) }} />

        {/* корпус: всё внутри — от верха корпуса */}
        <div className="gb-group" style={{ top: px(bodyTop) }}>
          {/* жидкость */}
          {geo.innerFaces.map((fc, i) => (
            <i
              key={`l${i}`}
              data-liq=""
              data-x0={fc.x0.toFixed(3)}
              data-x1={fc.x1.toFixed(3)}
              data-ang={fc.ang.toFixed(4)}
              className="gb-liquid"
              style={faceStyle(fc, liquidH + M, level - M - bodyTop)}
            />
          ))}
          <b
            ref={surface}
            className="gb-plate gb-surface"
            style={{
              left: `calc(50% - ${px((bw - wall * 2) / 2)})`,
              top: px(-(bd - wall * 2) / 2),
              width: px(bw - wall * 2),
              height: px(bd - wall * 2),
              clipPath: poly(geo.inner, bw - wall * 2, bd - wall * 2),
            }}
          />
          {/* дно: толстое стекло */}
          {plate(geo.body, bw, bd, bodyH - base, "gb-floor")}
          {plate(geo.body, bw, bd, bodyH, "gb-floor")}
          {/* стенки стекла */}
          {geo.bodyFaces.map((fc, i) => (
            <i
              key={`g${i}`}
              data-glass=""
              data-ang={fc.ang.toFixed(4)}
              className="gb-glass"
              style={{ ...faceStyle(fc, bodyH), "--base": px(base) } as React.CSSProperties}
            />
          ))}
          {plate(geo.body, bw, bd, 0, "gb-top")}
          {labelEl}
        </div>

        {/* горлышко, воротничок, крышка */}
        {geo.parts.map(({ p, pw, pd, pts }, k) => {
          const h = (p.bottom - p.top) * 100;
          const fin = p.finish === "glass" ? null : finishColors(p.finish);
          if (p.kind === "dome") {
            // купол: цилиндрическое основание и несколько ярусов сферы
            const tiers = 5;
            const baseH = h * 0.3;
            const domeH = h - baseH;
            const rings = [{ y: p.top * 100 + domeH, h: baseH, w: pw }];
            for (let t = 0; t < tiers; t++) {
              const a0 = (t / tiers) * (Math.PI / 2);
              const a1 = ((t + 1) / tiers) * (Math.PI / 2);
              const yTop = p.top * 100 + domeH * (1 - Math.sin(a1));
              const yBot = p.top * 100 + domeH * (1 - Math.sin(a0));
              rings.push({ y: yTop, h: yBot - yTop + 0.3, w: pw * Math.cos((a0 + a1) / 2) });
            }
            return (
              <div key={k} className="gb-group" style={{ top: 0 }}>
                {rings.map((r, ri) => {
                  const fs = faces(outline("round", r.w, r.w, 0, 10));
                  return fs.map((fc, i) => (
                    <i
                      key={`${ri}-${i}`}
                      data-fin={fin?.join("|")}
                      data-ang={fc.ang.toFixed(4)}
                      className="gb-metal"
                      style={faceStyle(fc, r.h, r.y)}
                    />
                  ));
                })}
                {plate(outline("round", pw * 0.2, pw * 0.2, 0, 12), pw * 0.2, pw * 0.2, p.top * 100 + 0.2, "gb-cap-top", { background: fin?.[2] })}
              </div>
            );
          }
          const fs = faces(pts);
          return (
            <div key={k} className="gb-group" style={{ top: px(p.top * 100) }}>
              {fs.map((fc, i) =>
                fin ? (
                  <i
                    key={i}
                    data-fin={fin.join("|")}
                    data-ang={fc.ang.toFixed(4)}
                    className={`gb-metal ${p.finish === "gold" || p.finish === "silver" ? "gb-fluted" : ""}`}
                    style={faceStyle(fc, h)}
                  />
                ) : (
                  <i key={i} className="gb-glass gb-neck" style={faceStyle(fc, h)} />
                ),
              )}
              {plate(pts, pw, pd, 0, fin ? "gb-cap-top" : "gb-top", fin ? { background: `linear-gradient(135deg, ${fin[2]}, ${fin[1]} 45%, ${fin[0]})` } : undefined)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GlassBottle;
