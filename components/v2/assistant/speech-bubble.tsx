import type { ReactNode } from "react";
import { toneShadow } from "./pop";

export type BubbleTone = "apricot" | "mint" | "butter" | "rose";

// Static class strings so Tailwind sees every one.
const TONES: Record<BubbleTone, string> = {
  apricot: "bg-apricot-surface",
  mint: "bg-mint-surface",
  butter: "bg-butter-surface",
  rose: "bg-rose-surface",
};

const TAILS = {
  bottom: "-bottom-1.5 left-1/2 -translate-x-1/2 shadow-[1px_1px_0_var(--tail-line)]",
  left: "-left-1.5 bottom-4 shadow-[-1px_1px_0_var(--tail-line)]",
};

/** Rounded bubble with a tail pointing at Pip, for things Pip says aloud. */
export function SpeechBubble({
  children,
  tone = "apricot",
  tail = "bottom",
  className = "",
}: {
  children: ReactNode;
  tone?: BubbleTone;
  /** Which side Pip is on. */
  tail?: keyof typeof TAILS;
  className?: string;
}) {
  const line = `var(--${tone}-line)`;
  return (
    <div
      style={{ boxShadow: toneShadow(line), ["--tail-line" as string]: line }}
      className={`relative w-max max-w-72 rounded-2xl px-3.5 py-2 ${TONES[tone]} ${className}`}
    >
      {children}
      <span aria-hidden className={`absolute size-3 rotate-45 ${TONES[tone]} ${TAILS[tail]}`} />
    </div>
  );
}
