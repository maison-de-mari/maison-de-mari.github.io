import { CompareNav } from "@/components/compare-nav";
import { PerfumeCarousel } from "@/components/ui/perfume-carousel";

export default function Home() {
  return (
    <main>
      <PerfumeCarousel engine="webgl">
        <CompareNav active="webgl" />
      </PerfumeCarousel>
    </main>
  );
}
