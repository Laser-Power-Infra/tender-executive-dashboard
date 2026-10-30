"use client";

import { useEffect, useRef, useState } from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { SquarePen, X } from "lucide-react";
import { IconButton } from "@/components/v2/ui/button";
import { describeError } from "@/components/v2/ui/errors";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { ChatWelcome } from "./chat-welcome";
import { PIP_SHADOW } from "./pop";

/** Pip's chat card: header, thread and composer. */
export function ChatWindow({
  chat,
  input,
  onInput,
  firstName,
  onClose,
}: {
  chat: UseChatHelpers<UIMessage>;
  input: string;
  onInput: (value: string) => void;
  firstName: string | null;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const { messages, status, error } = chat;
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!error) return setErrorText(null);
    describeError(error).then(setErrorText);
  }, [error]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    chat.sendMessage({ text: trimmed });
    onInput("");
  }

  const statusLine =
    status === "submitted" ? "Thinking" : status === "streaming" ? "Writing" : error ? "Something went wrong" : "Assistant";

  return (
    <section
      role="dialog"
      aria-label="Assistant"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      style={{ boxShadow: PIP_SHADOW }}
      className="flex h-[min(37.5rem,75dvh)] w-100 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-apricot-surface"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-apricot-line px-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="type-title leading-tight">Pip</h2>
          <p aria-live="polite" className={error ? "text-xs text-bad" : "text-xs text-apricot-ink"}>
            {statusLine}
          </p>
        </div>
        <IconButton
          label="New chat"
          disabled={busy || messages.length === 0}
          onClick={() => {
            chat.setMessages([]);
            inputRef.current?.focus();
          }}
        >
          <SquarePen className="size-4" />
        </IconButton>
        <IconButton label="Close (Esc)" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      <ChatThread
        messages={messages}
        status={status}
        errorText={errorText}
        onRetry={() => chat.regenerate()}
        empty={<ChatWelcome firstName={firstName} onPick={send} />}
      />

      <ChatComposer
        ref={inputRef}
        value={input}
        onChange={onInput}
        onSend={() => send(input)}
        onStop={() => chat.stop()}
        busy={busy}
      />
    </section>
  );
}
