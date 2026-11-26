/**
 * Стеклянные флаконы витрины «В стекле» — настройки для компонента GlassBottle.
 * color — цвет парфюма (замерен по фото аромата), fill — уровень наполнения (0…1),
 * label — картинка этикетки (вырезана с фото флакона), labelAspect — её ширина / высота,
 * cap — крышка: "gold" | "black" | любой CSS-цвет.
 */
export type GlassBottleSettings = {
  slug: string;
  color: string;
  fill?: number;
  label: string;
  labelAspect: number;
  cap?: string;
};

export const GLASS_BOTTLES: GlassBottleSettings[] = [
  { slug: "byredo-animalique", color: "#ae785d", fill: 0.75, label: "/labels/byredo-animalique.webp", labelAspect: 1.070, cap: "black" },
  { slug: "mfk-724", color: "#efece8", fill: 0.75, label: "/labels/mfk-724.webp", labelAspect: 0.790, cap: "gold" },
  { slug: "reservation-riviera-californienne", color: "#d4a940", fill: 0.75, label: "/labels/reservation-riviera-californienne.webp", labelAspect: 0.769, cap: "black" },
  { slug: "phlur-vanilla-skin", color: "#bd9766", fill: 0.75, label: "/labels/phlur-vanilla-skin.webp", labelAspect: 0.825, cap: "#f2efe9" },
  { slug: "zielinski-rozen-tobacco-cedarwood-pepper", color: "#883e0e", fill: 0.75, label: "/labels/zielinski-rozen-tobacco-cedarwood-pepper.webp", labelAspect: 1.182, cap: "gold" },
  { slug: "zielinski-rozen-bergamot-green-tea-sandalwood", color: "#542910", fill: 0.75, label: "/labels/zielinski-rozen-bergamot-green-tea-sandalwood.webp", labelAspect: 0.790, cap: "gold" },
  { slug: "essential-parfums-bois-imperial", color: "#f0ede3", fill: 0.75, label: "/labels/essential-parfums-bois-imperial.webp", labelAspect: 0.937, cap: "black" },
  { slug: "maison-crivelli-cuir-infrarouge", color: "#5e1f0d", fill: 0.75, label: "/labels/maison-crivelli-cuir-infrarouge.webp", labelAspect: 1.047, cap: "#9a9da3" },
];
