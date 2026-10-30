import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { ListFilter } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** One turn: the user's words in a tinted bubble, Pip's as markdown prose. */
export function ChatMessage({ message }: { message: UIMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  if (message.role === "user") {
    return <li className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl bg-apricot-soft px-3 py-2">{text}</li>;
  }
  // Each filter Pip set, as a quiet note above its reply; the formula is in the tooltip.
  const filters = message.parts.filter(
    (p) => isToolUIPart(p) && getToolName(p) === "set_filters" && p.state === "output-available",
  );
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      {filters.map((p) => {
        if (!isToolUIPart(p) || p.state !== "output-available") return null;
        const formula = (p.input as { formula?: string }).formula ?? "";
        const ok = (p.output as { ok?: boolean }).ok;
        return (
          <p key={p.toolCallId} title={formula || undefined} className="flex items-center gap-1.5 text-xs text-ink-3">
            <ListFilter className="size-3.5 shrink-0" aria-hidden />
            {!ok ? "Couldn't set that filter" : formula ? "Filters set" : "Filters cleared"}
          </p>
        );
      })}
      {text && (
        <div className="md min-w-0 *:last:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}
