"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/**
 * GSAP для всего сайта: плагины регистрируются один раз здесь (как советует официальный skill gsap-react).
 * Анимации — через useGSAP (сам убирает анимации и ScrollTrigger при размонтировании)
 * и gsap.matchMedia: с «уменьшить движение» прокручиваемых эффектов нет.
 */
gsap.registerPlugin(useGSAP, ScrollTrigger);

/** условие для анимаций при прокрутке: только если человек не просил уменьшить движение */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export { gsap, ScrollTrigger, useGSAP };
