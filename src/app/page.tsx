import { PerfumeCarousel } from "@/components/ui/perfume-carousel";
import { PerfumeShelf } from "@/components/ui/perfume-shelf";
import { ReliefPaper } from "@/components/ui/relief-paper";
import { Snow } from "@/components/ui/snow";
import { SiteNav } from "@/components/ui/site-nav";
import { CursorGlow } from "@/components/ui/cursor-glow";
import type { RingSpec } from "@/components/ui/glass-showcase/glass-ring";
import { getAroma, type AromaWithImages } from "@/data/aromas";
import { GLASS_RING } from "@/data/glass-ring";
import { PHOTO_BOTTLES } from "@/data/photo-bottles";

/**
 * Главная витрина: Out of the Blue — по листу из 6 снимков, остальные — фото-флаконы
 * с листов «спереди | сбоку | сзади» (тот же приём, что в out-of-the-blue-3d.html).
 */
const ring: RingSpec[] = [
  ...GLASS_RING.filter((g) => g.slug === "clive-christian-out-of-the-blue"),
  ...PHOTO_BOTTLES.filter((p) => p.slug === "clive-christian-uncovered").map((photo) => ({ photo })),
  ...PHOTO_BOTTLES.filter((p) => p.slug !== "clive-christian-uncovered").map((photo) => ({ photo })),
];
const slugOf = (s: RingSpec) => ("photo" in s ? s.photo.slug : s.slug);
const ringItems = ring.map((s) => getAroma(slugOf(s))).filter((a): a is AromaWithImages => !!a);

export default function Home() {
  return (
    <main>
      {/* фон всего сайта — бумага с гипсовым рельефом: проступает под курсором */}
      <ReliefPaper className="fixed inset-0 -z-10" />
      <SiteNav />
      <PerfumeCarousel items={ringItems} glass={ring} />
      <PerfumeShelf />
      <Snow />
      <CursorGlow />
    </main>
  );
}
