import { useEffect, useRef, useState } from "react";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { Check, ChevronRight, ListFilter, Loader2, TableProperties, TriangleAlert, type LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ToolPart = ToolUIPart | DynamicToolUIPart;

/** What a tool call reads as while it runs, and once it is done. */
function describeStep(p: ToolPart): { icon: LucideIcon; label: string; detail?: string } {
  const input = (p.input ?? {}) as { formula?: string; column?: string };
  const output = p.state === "output-available" ? (p.output as { ok?: boolean; errors?: string[] }) : undefined;
  switch (getToolName(p)) {
    case "get_table":
      return { icon: TableProperties, label: output ? "Read the table" : "Reading the table" };
    case "list_filter_values":
      return {
        icon: ListFilter,
        label: `${output ? "Looked up" : "Looking up"} values${input.column ? ` for ${input.column}` : ""}`,
      };
    case "set_filters": {
      const label = !output
        ? "Setting filters"
        : output.ok === false
          ? "Couldn't set that filter"
          : input.formula
            ? "Filters set"
            : "Filters cleared";
      return { icon: ListFilter, label, detail: input.formula || output?.errors?.join("; ") };
    }
    default:
      return { icon: ListFilter, label: getToolName(p) };
  }
}

function Step({ part }: { part: ToolPart }) {
  const { icon: Icon, label, detail } = describeStep(part);
  const running = part.state !== "output-available" && part.state !== "output-error";
  const failed =
    part.state === "output-error" ||
    (part.state === "output-available" && (part.output as { ok?: boolean })?.ok === false);
  const Status = running ? Loader2 : failed ? TriangleAlert : Check;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs text-ink-3">
      <p className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
        <Status className={`size-3 shrink-0 ${running ? "animate-spin" : ""}`} aria-hidden />
      </p>
      {detail && <code className="ml-5 break-words font-mono text-[11px] text-ink-3">{detail}</code>}
    </div>
  );
}

/** Pip's reasoning summary: open while it streams, folded into "Thought for Ns" once it is done. */
function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming);
  const started = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setOpen(streaming);
    if (!streaming) setSeconds(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
  }, [streaming]);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group min-w-0 text-xs text-ink-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        {streaming ? "Thinking" : `Thought for ${seconds}s`}
        {streaming && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />}
      </summary>
      <div className="md ml-5 mt-1 min-w-0 border-l border-line pl-3 *:last:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </details>
  );
}

/** One turn: the user's words in a tinted bubble; Pip's steps and prose in the order they stream in. */
export function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return <li className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl bg-apricot-soft px-3 py-2">{text}</li>;
  }
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      {message.parts.map((p, i) => {
        if (isToolUIPart(p)) return <Step key={p.toolCallId} part={p} />;
        if (p.type === "reasoning") {
          return p.text.trim() ? <Reasoning key={i} text={p.text} streaming={p.state === "streaming"} /> : null;
        }
        if (p.type === "text" && p.text) {
          return (
            <div key={i} className="md min-w-0 *:last:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
            </div>
          );
        }
        return null;
      })}
    </li>
  );
}
