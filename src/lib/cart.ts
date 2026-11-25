"use client";

import { useSyncExternalStore } from "react";

/** Корзина распива: позиция = аромат + объём. Хранится в localStorage этого браузера. */
export type CartItem = { slug: string; label: string; price: number };

const KEY = "mdm-cart";
const EMPTY: CartItem[] = [];
let items: CartItem[] = EMPTY;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) items = JSON.parse(raw) as CartItem[];
  } catch {
    items = EMPTY;
  }
}

function emit(next: CartItem[]) {
  items = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* приватный режим — корзина живёт до перезагрузки */
  }
  subs.forEach((f) => f());
}

export const cart = {
  has: (slug: string, label: string) => items.some((i) => i.slug === slug && i.label === label),
  toggle(item: CartItem) {
    load();
    emit(
      cart.has(item.slug, item.label)
        ? items.filter((i) => !(i.slug === item.slug && i.label === item.label))
        : [...items, item],
    );
  },
};

export function useCart() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => {
      load();
      return items;
    },
    () => EMPTY,
  );
}

export const sum = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ") + " сум";
