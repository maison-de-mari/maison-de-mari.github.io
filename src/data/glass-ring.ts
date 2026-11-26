import type { Bottle3DSpec } from "@/components/ui/glass-showcase/bottle3d";

/**
 * Главная витрина — стеклянные 3D-флаконы (Three.js).
 * color — цвет парфюма, fill — уровень, label — картинка этикетки (labelPrint — печать прямо на стекле),
 * shape — форма по фото: доли высоты сверху и ширины (замерены по фото с сайта магазина).
 */
const CLIVE = (crown: "silver" | "crystal"): Bottle3DSpec["shape"] => ({
  aspect: 0.385,
  body: { kind: "rect", top: 0.37, depth: 0.62, cut: 0.12 },
  parts: [
    { kind: "round", top: 0.3, bottom: 0.37, width: 0.42, finish: "glass" },
    { kind: "round", top: 0.215, bottom: 0.35, width: 0.5, finish: "silver" },
    { kind: "crown", top: 0, bottom: 0.225, width: 0.77, depth: 0.75, finish: crown },
  ],
});

export const GLASS_RING: Bottle3DSpec[] = [
  {
    slug: "clive-christian-out-of-the-blue",
    color: "#2338a8",
    fill: 0.75,
    label: "/labels/clive-christian-out-of-the-blue.png",
    labelPrint: true,
    shape: { ...CLIVE("silver"), label: [0.06, 0.43, 0.94, 0.97] },
  },
  {
    slug: "clive-christian-uncovered",
    color: "#ece6d8",
    fill: 0.75,
    label: "/labels/clive-christian-uncovered.png",
    labelPrint: true,
    shape: { ...CLIVE("crystal"), label: [0.166, 0.452, 0.834, 0.678] },
  },
];
