"use client";

import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { toast, type ToastT } from "sonner";
import { SpeechBubble, type BubbleTone } from "./speech-bubble";

const DEFAULT_MS = 4000;
const ERROR_MS = 6000;

type Kind = "success" | "warning" | "error" | "loading" | "info";

const TONE: Record<Kind, BubbleTone> = {
  success: "mint",
  warning: "butter",
  error: "rose",
  loading: "apricot",
  info: "apricot",
};

export function noticeKind(t: Pick<ToastT, "type">): Kind {
  return t.type === "success" || t.type === "warning" || t.type === "error" || t.type === "loading"
    ? t.type
    : "info";
}

const render = (v: ToastT["title"]) => (typeof v === "function" ? v() : v);

/**
 * One sonner toast, said by Pip: just the words, in the tone's colour, with
 * Pip's face carrying the feeling. Dismisses itself; hovering holds it open,
 * clicking it sends it away.
 */
export function NoticeBubble({ notice, tail }: { notice: ToastT; tail: "bottom" | "left" }) {
  const kind = noticeKind(notice);
  const [held, setHeld] = useState(false);
  const ms = notice.duration ?? (kind === "error" ? ERROR_MS : DEFAULT_MS);

  // Restart the clock whenever the toast changes (a promise settling, say).
  useEffect(() => {
    if (held || kind === "loading" || ms === Infinity) return;
    const t = setTimeout(() => toast.dismiss(notice.id), ms);
    return () => clearTimeout(t);
  }, [held, kind, ms, notice.id, notice.title, notice.description]);

  const action = notice.action;
  const description = render(notice.description);

  return (
    <SpeechBubble tone={TONE[kind]} tail={tail}>
      <div
        role={kind === "error" ? "alert" : "status"}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onClick={() => notice.dismissible !== false && toast.dismiss(notice.id)}
        className="cursor-default"
      >
        <p>{render(notice.title)}</p>
        {description ? <p className="mt-0.5 whitespace-pre-line text-ink-2">{description}</p> : null}
        {action && typeof action === "object" && !isValidElement(action) && "label" in action ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick(e);
              toast.dismiss(notice.id);
            }}
            className="press mt-1 font-medium text-accent-ink"
          >
            {action.label}
          </button>
        ) : (
          (action as ReactNode)
        )}
      </div>
    </SpeechBubble>
  );
}
