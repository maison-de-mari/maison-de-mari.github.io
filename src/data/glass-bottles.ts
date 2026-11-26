import type { BottleShape } from "@/components/ui/glass-bottle";

/**
 * Стеклянные флаконы витрины «В стекле» — настройки компонента GlassBottle.
 * color — цвет парфюма (замерен по фото аромата), fill — уровень наполнения (0…1),
 * label — картинка этикетки (вырезана с фото флакона),
 * shape — форма как у настоящего флакона: пропорции замерены по фото анфас (доли высоты сверху и ширины),
 *   корпус «round» — цилиндр, «rect» — коробка со скошенными рёбрами; крышка — round / rect / dome.
 */
export type GlassBottleSettings = {
  slug: string;
  color: string;
  fill?: number;
  label: string;
  shape: BottleShape;
};

export const GLASS_BOTTLES: GlassBottleSettings[] = [
  {
    slug: "byredo-animalique",
    color: "#ae785d",
    fill: 0.75,
    label: "/labels/byredo-animalique.webp",
    shape: {
      aspect: 0.642,
      body: { kind: "round", top: 0.351, depth: 0.9 },
      parts: [
        { kind: "round", top: 0.215, bottom: 0.351, width: 0.4, finish: "glass" },
        { kind: "dome", top: 0, bottom: 0.225, width: 0.59, finish: "black" },
      ],
      label: [0.069, 0.354, 0.93, 0.87],
    },
  },
  {
    slug: "mfk-724",
    color: "#efece8",
    fill: 0.75,
    label: "/labels/mfk-724.webp",
    shape: {
      aspect: 0.567,
      body: { kind: "rect", top: 0.344, depth: 0.62, cut: 0.14 },
      parts: [
        { kind: "round", top: 0.29, bottom: 0.344, width: 0.48, finish: "glass" },
        { kind: "round", top: 0.2, bottom: 0.29, width: 0.42, finish: "gold" },
        { kind: "rect", top: 0, bottom: 0.2, width: 0.57, depth: 0.85, finish: "gold" },
      ],
      label: [0.13, 0.4, 0.869, 0.93],
    },
  },
  {
    slug: "reservation-riviera-californienne",
    color: "#d4a940",
    fill: 0.75,
    label: "/labels/reservation-riviera-californienne.webp",
    shape: {
      aspect: 0.412,
      body: { kind: "round", top: 0.387, depth: 0.82 },
      parts: [
        { kind: "round", top: 0.21, bottom: 0.387, width: 0.5, finish: "glass" },
        { kind: "round", top: 0.175, bottom: 0.21, width: 0.55, finish: "black" },
        { kind: "rect", top: 0, bottom: 0.175, width: 0.64, depth: 0.95, finish: "black" },
      ],
      label: [0.132, 0.53, 0.879, 0.93],
    },
  },
  {
    slug: "phlur-vanilla-skin",
    color: "#bd9766",
    fill: 0.75,
    label: "/labels/phlur-vanilla-skin.webp",
    shape: {
      aspect: 0.491,
      body: { kind: "rect", top: 0.316, depth: 0.6, cut: 0.1 },
      parts: [
        { kind: "rect", top: 0.245, bottom: 0.316, width: 0.56, depth: 0.62, finish: "glass" },
        { kind: "rect", top: 0, bottom: 0.245, width: 0.75, depth: 0.82, finish: "white" },
      ],
      label: [0.15, 0.402, 0.859, 0.824],
    },
  },
  {
    slug: "zielinski-rozen-tobacco-cedarwood-pepper",
    color: "#883e0e",
    fill: 0.75,
    label: "/labels/zielinski-rozen-tobacco-cedarwood-pepper.webp",
    shape: {
      aspect: 0.427,
      body: { kind: "round", top: 0.332 },
      parts: [
        { kind: "round", top: 0.27, bottom: 0.332, width: 0.32, finish: "glass" },
        { kind: "round", top: 0.235, bottom: 0.27, width: 0.46, finish: "gold" },
        { kind: "round", top: 0, bottom: 0.235, width: 0.54, finish: "gold" },
      ],
      label: [0.028, 0.42, 0.97, 0.76],
    },
  },
  {
    slug: "zielinski-rozen-bergamot-green-tea-sandalwood",
    color: "#542910",
    fill: 0.75,
    label: "/labels/zielinski-rozen-bergamot-green-tea-sandalwood.webp",
    shape: {
      aspect: 0.353,
      body: { kind: "round", top: 0.323 },
      parts: [
        { kind: "round", top: 0.3, bottom: 0.323, width: 0.36, finish: "glass" },
        { kind: "round", top: 0.12, bottom: 0.3, width: 0.4, finish: "gold" },
        { kind: "round", top: 0, bottom: 0.12, width: 0.28, finish: "gold" },
      ],
      label: [0.047, 0.47, 0.96, 0.878],
    },
  },
  {
    slug: "essential-parfums-bois-imperial",
    color: "#f0ede3",
    fill: 0.75,
    label: "/labels/essential-parfums-bois-imperial.webp",
    shape: {
      aspect: 0.483,
      body: { kind: "rect", top: 0.249, depth: 0.55, cut: 0.06 },
      parts: [
        { kind: "rect", top: 0.2, bottom: 0.249, width: 0.42, depth: 0.7, finish: "glass" },
        { kind: "rect", top: 0, bottom: 0.2, width: 0.56, depth: 0.85, finish: "black" },
      ],
      label: [0.179, 0.34, 0.82, 0.67],
    },
  },
  {
    slug: "maison-crivelli-cuir-infrarouge",
    color: "#5e1f0d",
    fill: 0.75,
    label: "/labels/maison-crivelli-cuir-infrarouge.webp",
    shape: {
      aspect: 0.351,
      body: { kind: "round", top: 0.317 },
      parts: [
        { kind: "round", top: 0.25, bottom: 0.317, width: 0.5, finish: "silver" },
        { kind: "round", top: 0, bottom: 0.25, width: 0.72, finish: "silver" },
      ],
      label: [0, 0.402, 1, 0.737],
    },
  },
];
