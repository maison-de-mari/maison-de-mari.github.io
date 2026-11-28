"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { addSmearTarget, removeSmearTarget } from "@/lib/smear";

/**
 * Крупные заголовки (от 20 px), появляющиеся на экране, рисует heading-smear.tsx — «чернилами», как главный
 * заголовок immersive-g.com. Остальной текст (и запасной вариант) проявляется по буквам: буквы по очереди слева направо выплывают
 * из прозрачности, и каждая начинает раньше, чем закончилась предыдущая, — мягкая волна света по строке.
 * Только прозрачность, без сдвигов. Срабатывает, когда текст попадает на экран (один раз),
 * или сразу при монтировании (inView=false). Для экранного диктора — весь текст целиком (aria-label).
 */
type Props = {
  text: string;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  delay?: number;
  /** оставлено для совместимости: скорость волны теперь считается по длине текста */
  stagger?: number;
  /** запускать при появлении на экране (true) или сразу при монтировании (false) */
  inView?: boolean;
  /** появление «чернилами» и для текста, который появляется при монтировании (названия ароматов) */
  ink?: boolean;
  /** длительность «чернил», с (по умолчанию 4, как у immersive-g) */
  inkTime?: number;
};

/** доля общего времени, на которую буква «перекрывает» следующие (как fadeDurationOffset у них) */
const OVERLAP = 0.2;

export function RevealText({ text, className = "", as = "span", delay = 0, inView = true, ink = false, inkTime }: Props) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  // крупные заголовки курсор «размазывает» (heading-smear.tsx)
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    addSmearTarget(n);
    return () => removeSmearTarget(n);
  }, []);
  const words = text.split(" ");
  const n = Math.max(1, text.replace(/\s/g, "").length);
  // вся волна: короткие подписи — быстро, длинные строки — дольше, но не тянуть
  const total = Math.min(2.4, 0.55 + n * 0.04);
  let i = 0;
  return (
    <Tag
      ref={el as React.Ref<never>}
      className={className}
      aria-label={text}
      // крупные заголовки, появляющиеся на экране, рисует «чернилами» heading-smear.tsx (буквы ниже — запасной вариант)
      data-ink={(inView || ink) && !reduce ? "" : undefined}
      data-ink-delay={delay || undefined}
      data-ink-time={inkTime}
    >
      {words.map((w, wi) => (
        <span key={`${w}-${wi}`} aria-hidden className="whitespace-nowrap">
          {Array.from(w).map((ch, ci) => {
            const k = i++;
            return (
              <motion.span
                key={ci}
                data-ch
                initial={reduce ? false : { opacity: 0 }}
                {...(inView ? { whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.5 } } : { animate: { opacity: 1 } })}
                transition={{ duration: total * (1 / n + OVERLAP), delay: delay + (total * k) / n, ease: "linear" }}
              >
                {ch}
              </motion.span>
            );
          })}
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

export default RevealText;
