/** Motion and surface values shared by everything that pops out of Pip. */

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Outline plus a glow in the tone's own colour, so what Pip says lifts off the page. */
export const toneShadow = (line: string) =>
  `0 0 0 1px ${line}, 0 8px 28px color-mix(in srgb, ${line} 55%, transparent), var(--shadow-pop)`;

// Pip speaks in apricot so its bubbles and chat stand apart from the page.
export const PIP_SHADOW = toneShadow("var(--apricot-line)");

/** Grows out of Pip's head; reduced motion fades only. */
export function popIn(reduceMotion: boolean | null) {
  return {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
    exit: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.14, ease: EASE_OUT } },
    style: { transformOrigin: "bottom center" },
  };
}
