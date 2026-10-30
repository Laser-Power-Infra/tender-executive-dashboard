import type { ReactNode } from "react";

// Puffs that bulge past the body to make the cloud edge, and the shrinking
// dots that trail down to Pip's head. Sizes are fixed so the silhouette
// stays round whatever the text length.
const PUFFS = [
  // top edge
  "left-[2%] -top-2 size-8",
  "left-[16%] -top-4 size-10",
  "left-[34%] -top-5 size-12",
  "left-[54%] -top-4 size-11",
  "left-[72%] -top-3 size-9",
  "right-[0%] -top-1 size-8",
  // sides
  "-left-4 top-[10%] size-9",
  "-left-3 bottom-[8%] size-8",
  "-right-4 top-[14%] size-10",
  "-right-3 bottom-[6%] size-8",
  // bottom edge
  "left-[4%] -bottom-2 size-8",
  "left-[22%] -bottom-3 size-10",
  "left-[42%] -bottom-4 size-11",
  "left-[62%] -bottom-3 size-9",
  "right-[6%] -bottom-2 size-8",
];
const DOTS = ["left-[46%] -bottom-9 size-3.5", "left-[54%] -bottom-12 size-2"];

/**
 * Cloud-shaped bubble for what Pip is thinking. Every shape is drawn twice:
 * an outlined layer underneath, then a plain fill on top that hides the
 * outlines where shapes overlap, so only the outer silhouette is stroked.
 */
export function ThoughtBubble({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-max max-w-60 px-6 py-4 text-center drop-shadow-[0_8px_18px_color-mix(in_srgb,var(--apricot-line)_55%,transparent)]">
      <Shapes className="bg-apricot-surface shadow-[0_0_0_1px_var(--apricot-line)]" />
      <Shapes className="bg-apricot-surface" />
      <p className="relative">{children}</p>
    </div>
  );
}

function Shapes({ className }: { className: string }) {
  return (
    <div aria-hidden className="absolute inset-0">
      <span className={`absolute inset-0 rounded-[2rem] ${className}`} />
      {[...PUFFS, ...DOTS].map((p) => (
        <span key={p} className={`absolute rounded-full ${p} ${className}`} />
      ))}
    </div>
  );
}
