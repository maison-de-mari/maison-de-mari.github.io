"use client";

import { useSyncExternalStore } from "react";

/**
 * Насколько тяжёлую графику показывать: "rich" — живое стекло, объёмные флаконы, искры;
 * "lite" — те же витрины на качественных фото, почти без работы видеокарты.
 * По умолчанию лёгкий режим; богатый — только на заведомо сильных устройствах.
 * Если во время работы кадры не успевают (reportSlow), сайт сам переходит на лёгкий режим.
 */
export type Tier = "rich" | "lite";

let tier: Tier | null = null;
const subs = new Set<() => void>();

/** Видеокарта по WebGL: встроенные и мобильные — слабые */
function gpuName() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "none";
  }
}

function detect(): Tier {
  const m = (q: string) => window.matchMedia(q).matches;
  if (m("(pointer: coarse)") || m("(prefers-reduced-motion: reduce)")) return "lite";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return "lite";
  if ((nav.deviceMemory ?? 8) < 8 || (navigator.hardwareConcurrency ?? 8) < 6) return "lite";
  const gpu = gpuName().toLowerCase();
  if (/none|swiftshader|llvmpipe|software|basic render|intel|uhd|iris|mali|adreno|powervr|apple gpu|microsoft/.test(gpu)) return "lite";
  // дискретные видеокарты и Apple M-серии
  if (/nvidia|geforce|rtx|gtx|radeon|amd|apple m\d/.test(gpu)) return "rich";
  return "lite";
}

function get(): Tier {
  if (tier === null) {
    tier = detect();
    try {
      // однажды сайт уже тормозил на этом устройстве — сразу лёгкий режим
      if (window.sessionStorage.getItem("mdm-lite") === "1") tier = "lite";
    } catch {
      /* без хранилища — просто по определению */
    }
  }
  return tier;
}

export const quality = {
  get,
  /** витрина не успевает рисовать кадры — переходим на лёгкий режим (один раз, для всех витрин) */
  reportSlow() {
    if (get() === "lite") return;
    tier = "lite";
    try {
      window.sessionStorage.setItem("mdm-lite", "1");
    } catch {
      /* ничего */
    }
    subs.forEach((f) => f());
  },
};

/** Режим графики; null — пока страница не загрузилась в браузере (на сервере его не узнать) */
export function useQuality(): Tier | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    get,
    () => null,
  );
}
