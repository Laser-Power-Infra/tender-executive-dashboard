const STARTERS = ["Show what closes this week", "Clear all filters", "Explain EMD and PBG"];

/** Empty chat: a greeting and a couple of questions to start from. */
export function ChatWelcome({ firstName, onPick }: { firstName: string | null; onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-end gap-3 pb-1">
      <div>
        <p className="type-title">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
        <p className="mt-0.5 text-ink-2">Ask about tenders, or tell me what to show and I&apos;ll filter the table.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="press hairline not-disabled:hover:bg-hover rounded-full bg-surface px-3 py-1.5 text-xs text-ink-2"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
