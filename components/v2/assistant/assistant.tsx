"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSonner } from "sonner";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Tip } from "@/components/v2/ui/overlay";
import { ChatWindow } from "./chat-window";
import { noticeKind } from "./notice-bubble";
import { NoticeStack } from "./notice-stack";
import { PipOrb } from "./pip-orb";
import { describeTable, pipTable } from "./pip-table";
import { popIn } from "./pop";
import { usePipMood } from "./use-pip-mood";

// Horizontal centre of the content area, beside the sidebar in either width.
const CENTER =
  "left-[calc(50%+var(--sidebar-w)/2)] in-data-[sidebar=collapsed]:left-[calc(50%+var(--sidebar-rail-w)/2)] -translate-x-1/2";
// Hangs off the top of the dock, centred on Pip.
const ABOVE = "absolute bottom-full left-1/2 -translate-x-1/2";

// A function body, so every turn carries the page Pip is on now.
const transport = new DefaultChatTransport({
  api: "/api/assistant",
  body: () => ({ path: location.pathname }),
});

const NO_TABLE = "This page has no table to filter.";

export function Assistant() {
  const { data: session, status: sessionStatus } = useSession();
  if (sessionStatus !== "authenticated") return null;
  return <AssistantDock firstName={session.user?.name?.split(" ")[0] ?? null} />;
}

/** Pip and whatever pops out of it. One fixed dock, so moving it moves everything. */
function AssistantDock({ firstName }: { firstName: string | null }) {
  const reduceMotion = useReducedMotion();
  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Pip's tools act on the page's table, so they run here. No await on addToolOutput: it deadlocks.
    async onToolCall({ toolCall }) {
      const table = pipTable();
      const input = toolCall.input as { formula?: string; column?: string };
      const answer = (output: unknown) =>
        chat.addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
      if (toolCall.toolName === "get_table") {
        answer(describeTable(table));
      } else if (toolCall.toolName === "set_filters") {
        const errors = table ? await table.apply(input.formula ?? "") : [NO_TABLE];
        answer(errors.length ? { ok: false, errors } : { ok: true });
      } else if (toolCall.toolName === "list_filter_values") {
        const values = table ? await table.values(input.column ?? "") : null;
        answer(
          values
            ? values.map((o) => ({ value: o.value, label: o.label }))
            : { error: table ? `${input.column} is not a list column` : NO_TABLE },
        );
      }
    },
  });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const orbRef = useRef<HTMLButtonElement>(null);
  // Every sonner toast in the app is said by Pip instead (the Toaster hides itself).
  const { toasts } = useSonner();

  const mood = usePipMood({
    status: chat.status,
    failed: !!chat.error,
    open,
    typing: !!input.trim(),
    notice: toasts[0] ? noticeKind(toasts[0]) : null,
  });

  function press() {
    setOpen((o) => !o);
  }

  // Ctrl/Cmd+J presses Pip from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Closing the chat hands focus back to Pip.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) orbRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const orb = (
    <PipOrb
      ref={orbRef}
      mood={mood}
      aria-label={open ? "Close assistant" : "Open assistant"}
      aria-expanded={open}
      onClick={press}
    />
  );

  return (
    <div className={`fixed -bottom-2 z-(--z-assistant) ${CENTER}`}>
      {/* Chat closed: notifications rise from Pip's head.
          Chat open: the card takes that space, so notifications move beside Pip. */}
      {open ? (
        <div className="absolute bottom-6 left-full ml-3 w-max">
          <NoticeStack toasts={toasts} tail="left" />
        </div>
      ) : (
        <div className={`${ABOVE} mb-3 flex w-max flex-col items-center gap-2`}>
          <NoticeStack toasts={toasts} tail="bottom" />
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div key="chat" {...popIn(reduceMotion)} className={`${ABOVE} mb-3`}>
            <ChatWindow
              chat={chat}
              input={input}
              onInput={setInput}
              firstName={firstName}
              onClose={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Tip label={open ? "Close Pip (Ctrl+J)" : "Ask Pip (Ctrl+J)"} side="top">
        {orb}
      </Tip>
    </div>
  );
}
