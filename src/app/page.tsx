import { GlassCollection } from "@/components/ui/glass-collection";
import { PerfumeCarousel } from "@/components/ui/perfume-carousel";
import { PerfumeShelf } from "@/components/ui/perfume-shelf";

export default function Home() {
  return (
    <main>
      <PerfumeCarousel />
      <GlassCollection />
      <PerfumeShelf />
    </main>
  );
}
