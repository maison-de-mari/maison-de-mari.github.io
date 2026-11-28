/**
 * Заголовки для эффектов heading-smear.tsx: RevealText регистрирует сюда свой элемент.
 * Крупные (от 20 px) курсор размазывает; с data-ink — ещё и появляются «чернилами».
 */
export const smearTargets = new Set<HTMLElement>();

const subs = new Set<() => void>();

export function addSmearTarget(el: HTMLElement) {
  smearTargets.add(el);
  subs.forEach((f) => f());
}

export function removeSmearTarget(el: HTMLElement) {
  smearTargets.delete(el);
}

/** новые заголовки на странице; возвращает отписку */
export function onSmearTargets(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
