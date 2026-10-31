"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatStatus } from "ai";

export type PipMood =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "working"
  | "error"
  | "celebrating"
  | "surprised"
  | "sleeping";

// How Pip reacts while it is saying a notification.
const NOTICE_MOOD = {
  success: "celebrating",
  warning: "surprised",
  error: "error",
  loading: "working",
  info: "speaking",
} as const satisfies Record<string, PipMood>;

const SLEEP_AFTER_MS = 2 * 60 * 1000;
const CELEBRATE_MS = 1500;

/** What Pip's face shows, from the chat, the composer and how long it has been quiet. */
export function usePipMood({
  status,
  failed,
  open,
  typing,
  notice,
}: {
  status: ChatStatus;
  failed: boolean;
  open: boolean;
  typing: boolean;
  /** Kind of the newest notification Pip is saying, if any. */
  notice: keyof typeof NOTICE_MOOD | null;
}): PipMood {
  const [celebrating, setCelebrating] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const prevStatus = useRef(status);
  const busy = status === "submitted" || status === "streaming";

  // A finished turn earns a short celebration before settling back to idle.
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (was === "streaming" && status === "ready") {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
      return () => clearTimeout(t);
    }
  }, [status]);

  // Doze off after a while with nothing happening; any activity wakes it.
  useEffect(() => {
    setAsleep(false);
    if (open || busy || notice) return;
    const t = setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    return () => clearTimeout(t);
  }, [open, busy, notice]);

  if (notice) return NOTICE_MOOD[notice];
  if (failed) return "error";
  if (status === "submitted") return "thinking";
  if (status === "streaming") return "speaking";
  if (celebrating) return "celebrating";
  if (open && typing) return "listening";
  if (asleep) return "sleeping";
  return "idle";
}
