"use client";

import { useId, type Ref } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/v2/ui/button";

/** Message box: Enter sends, Shift+Enter breaks the line, Stop while Pip replies. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="shrink-0 p-3 pt-0"
    >
      <div className="edge flex items-end gap-2 rounded-xl bg-surface p-1.5 pl-3 focus-within:outline-2 focus-within:outline-accent">
        <label htmlFor={id} className="sr-only">
          Message Pip
        </label>
        <textarea
          ref={ref}
          id={id}
          rows={1}
          autoFocus
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={disabled ? "Start a new chat to continue" : "Ask Pip"}
          className="field-sizing-content max-h-36 min-h-7 flex-1 resize-none bg-transparent py-1 leading-snug outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
        {busy ? (
          <Button
            size="sm"
            className="w-7 px-0"
            aria-label="Stop"
            title="Stop"
            icon={<Square className="size-3 fill-current" />}
            onClick={onStop}
          />
        ) : (
          <Button
            type="submit"
            size="sm"
            variant="primary"
            className="w-7 px-0"
            aria-label="Send"
            title="Send (Enter)"
            disabled={disabled || !value.trim()}
            icon={<ArrowUp className="size-3.5" />}
          />
        )}
      </div>
    </form>
  );
}
