import type { Metadata } from "next";
import { CompareNav } from "@/components/compare-nav";
import { ModelViewer, type ModelEntry } from "@/components/ui/model-viewer";

export const metadata: Metadata = { title: "3D-модели флаконов — Maison De Mari" };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// проба Higgsfield image-to-3D: два генератора на двух флаконах
const MODELS: ModelEntry[] = [
  { id: "zt-tripo", aroma: "Zielinski & Rozen Tobacco", engine: "Tripo H3.1", src: "/models/zielinski-tobacco-tripo.glb", photo: "/bottles/zielinski-rozen-tobacco-cedarwood-pepper.webp", mb: 2.9 },
  { id: "zt-hunyuan", aroma: "Zielinski & Rozen Tobacco", engine: "Hunyuan3D v3", src: "/models/zielinski-tobacco-hunyuan.glb", photo: "/bottles/zielinski-rozen-tobacco-cedarwood-pepper.webp", mb: 1.3 },
  { id: "bc-tripo", aroma: "Bleu de Chanel Parfum", engine: "Tripo H3.1", src: "/models/bleu-de-chanel-tripo.glb", photo: "/bottles/bleu-de-chanel-parfum.webp", mb: 2.8 },
  { id: "bc-hunyuan", aroma: "Bleu de Chanel Parfum", engine: "Hunyuan3D v3", src: "/models/bleu-de-chanel-hunyuan.glb", photo: "/bottles/bleu-de-chanel-parfum.webp", mb: 1.1 },
];

export default function Models() {
  return (
    <main>
      <section aria-label="3D-модели флаконов" className="relative isolate h-[max(640px,100svh)] w-full overflow-hidden bg-night text-ink">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_40%,#2a1b12_0%,#160e0a_48%,#0b0706_100%)]" />
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
          <a href={`${BASE}/`} className="pointer-events-auto font-script text-[2rem] leading-none text-gold sm:text-[2.4rem]">
            Maison De Mari
          </a>
          <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-soft">Проба 3D-моделей</span>
        </header>
        <ModelViewer models={MODELS} />
        <CompareNav active="models" />
      </section>
    </main>
  );
}
