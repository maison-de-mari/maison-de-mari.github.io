/** Временный переключатель вариантов витрины — чтобы сравнить и выбрать один */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const LINKS = [
  { href: "/", label: "three.js", key: "webgl" },
  { href: "/css/", label: "CSS 3D", key: "css" },
  { href: "/models/", label: "3D-модели", key: "models" },
] as const;

export function CompareNav({ active }: { active: (typeof LINKS)[number]["key"] }) {
  return (
    <nav
      aria-label="Варианты витрины"
      className="absolute inset-x-0 top-[4.5rem] z-30 flex justify-center px-4 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:top-auto"
    >
      <div className="flex gap-1 rounded-full bg-night/70 p-1 ring-1 ring-ink/15 backdrop-blur-md">
        {LINKS.map((l) => (
          <a
            key={l.key}
            href={`${BASE}${l.href}`}
            aria-current={l.key === active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors ${
              l.key === active ? "bg-gold text-night" : "text-ink/75 hover:text-ink"
            }`}
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
