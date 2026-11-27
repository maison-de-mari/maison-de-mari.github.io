"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Текст проявляется по словам: каждое слово медленно темнеет из бледного и чуть поднимается,
 * слова — одно за другим. Срабатывает, когда текст попадает на экран (один раз),
 * или сразу при смене текста (key — сам текст), если once=false.
 * Для экранного диктора — весь текст целиком (aria-label), слова скрыты.
 */
type Props = {
  text: string;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  delay?: number;
  /** пауза между словами, с */
  stagger?: number;
  /** запускать при появлении на экране (true) или сразу при монтировании (false) */
  inView?: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function RevealText({ text, className = "", as = "span", delay = 0, stagger = 0.12, inView = true }: Props) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const words = text.split(" ");
  const hidden = { opacity: 0.06, y: "0.18em" };
  const shown = { opacity: 1, y: "0em" };
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} aria-hidden>
          <motion.span
            className="inline-block"
            initial={reduce ? false : hidden}
            {...(inView ? { whileInView: shown, viewport: { once: true, amount: 0.5 } } : { animate: shown })}
            transition={{ duration: 1.6, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

export default RevealText;
