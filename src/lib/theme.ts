"use client";

import { useSyncExternalStore } from "react";

/**
 * Тема сайта: светлая (по умолчанию) или тёмно-серая. Хранится в localStorage этого браузера,
 * ставится атрибутом data-theme на <html> ещё до первой отрисовки (скрипт в layout.tsx) — без мигания.
 * Цвета — токены в globals.css; WebGL-части (бумага, подиум) подписываются через onTheme.
 */
export type Theme = "light" | "dark";

const KEY = "mdm-theme";

export const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(t: Theme) {
  const h = document.documentElement;
  // на время смены все цвета перетекают плавно
  h.classList.add("theme-fade");
  h.dataset.theme = t;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* приватный режим — тема живёт до перезагрузки */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#242322" : "#f7f4ef");
  window.setTimeout(() => h.classList.remove("theme-fade"), 800);
}

/** подписка на смену темы; возвращает отписку */
export function onTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(onTheme, getTheme, () => "light");
}

/** цвет токена из CSS (например --color-paper) */
export function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
