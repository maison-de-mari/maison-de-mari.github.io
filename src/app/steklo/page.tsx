import type { Metadata } from "next";
import { GlassShowcase } from "@/components/ui/glass-showcase/glass-showcase";
import type { Bottle3DSpec } from "@/components/ui/glass-showcase/bottle3d";

export const metadata: Metadata = { title: "В стекле — проба · Maison De Mari" };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Проба: 5 разных флаконов в фотореалистичном стекле (по образцу flakon-namuna.html).
 * color — цвет парфюма (→ attenuationColor), fill — уровень, label — картинка этикетки,
 * shape — форма по фото: доли высоты сверху и ширины фото.
 */
const ITEMS: Bottle3DSpec[] = [
  {
    slug: "mfk-724",
    color: "#e9e3d6",
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
    slug: "byredo-animalique",
    color: "#c98a68",
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
    slug: "zielinski-rozen-tobacco-cedarwood-pepper",
    color: "#b9763f",
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
    slug: "reservation-riviera-californienne",
    color: "#d9b24a",
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
    color: "#d7b083",
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
];

export default function Steklo() {
  return (
    <main className="min-h-svh bg-night px-4 py-12 text-ink sm:px-8">
      <header className="mx-auto mb-10 flex max-w-[1200px] items-end justify-between gap-4">
        <div>
          <a href={`${BASE}/`} className="font-script text-[2rem] leading-none text-gold">
            Maison De Mari
          </a>
          <h1 className="mt-6 text-[clamp(1.6rem,4vw,2.6rem)] font-light uppercase leading-none tracking-[0.18em]">В стекле</h1>
          <p className="mt-3 max-w-[52ch] text-sm text-soft">Проба: наведите на флакон — он наклонится, жидкость качнётся; потяните — повернётся.</p>
        </div>
      </header>
      <div className="mx-auto max-w-[1200px]">
        <GlassShowcase items={ITEMS} />
      </div>
    </main>
  );
}
