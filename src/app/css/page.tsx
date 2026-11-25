import type { Metadata } from "next";
import { CompareNav } from "@/components/compare-nav";
import { PerfumeCarousel } from "@/components/ui/perfume-carousel";

export const metadata: Metadata = { title: "Витрина на CSS 3D — Maison De Mari" };

export default function CssShowcase() {
  return (
    <main>
      <PerfumeCarousel engine="css">
        <CompareNav active="css" />
      </PerfumeCarousel>
    </main>
  );
}
