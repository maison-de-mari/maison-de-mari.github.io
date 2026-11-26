import { PerfumeCarousel } from "@/components/ui/perfume-carousel";
import { PerfumeShelf } from "@/components/ui/perfume-shelf";
import { getAroma, type AromaWithImages } from "@/data/aromas";
import { GLASS_RING } from "@/data/glass-ring";

// главная витрина — только стеклянные флаконы
const ringItems = GLASS_RING.map((g) => getAroma(g.slug)).filter((a): a is AromaWithImages => !!a);

export default function Home() {
  return (
    <main>
      <PerfumeCarousel items={ringItems} glass={GLASS_RING} />
      <PerfumeShelf />
    </main>
  );
}
