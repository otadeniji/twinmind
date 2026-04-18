import { RefreshCw, Loader2, Lightbulb, HelpCircle, MessageSquare, CheckCircle2, BookOpen } from "lucide-react";
import { Button } from "./ui/button";

const TYPE_META = {
  question:      { label: "Question to ask",   Icon: HelpCircle,    tone: "bg-blue-50 text-blue-700 border-blue-200" },
  talking_point: { label: "Talking point",     Icon: MessageSquare, tone: "bg-violet-50 text-violet-700 border-violet-200" },
  answer:        { label: "Answer",            Icon: Lightbulb,     tone: "bg-amber-50 text-amber-800 border-amber-200" },
  fact_check:    { label: "Fact check",        Icon: CheckCircle2,  tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  clarification: { label: "Clarification",     Icon: BookOpen,      tone: "bg-slate-50 text-slate-700 border-slate-200" },
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Card({ suggestion, onClick }) {
  const meta = TYPE_META[suggestion.type] || TYPE_META.talking_point;
  const Icon = meta.Icon;
  return (
    <button
      data-testid="suggestion-card"
      data-suggestion-type={suggestion.type}
      onClick={() => onClick(suggestion)}
      className="group w-full rounded-lg border border-neutral-200 bg-white p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.tone}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>
      <h3 className="heading mb-1 text-[0.95rem] font-medium leading-snug text-neutral-900">
        {suggestion.title}
      </h3>
      <p className="text-[0.84rem] leading-relaxed text-neutral-600 group-hover:text-neutral-800">
        {suggestion.preview}
      </p>
    </button>
  );
}

export function SuggestionsColumn({ batches, loading, onRefresh, onCardClick, error, canRefresh }) {
  return (
    <section
      data-testid="suggestions-column"
      className="flex h-full min-h-0 flex-col border-r border-neutral-200 bg-neutral-50/40"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="heading text-sm font-medium tracking-wide text-neutral-900">Live suggestions</h2>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />}
        </div>
        <Button
          data-testid="refresh-suggestions-btn"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={!canRefresh || loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="suggestions-scroll">
        {batches.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-neutral-500">
            <Lightbulb className="mb-3 h-8 w-8 text-neutral-300" />
            <p className="max-w-[32ch] leading-relaxed">
              3 context-aware suggestions will appear here every ~30 seconds once the mic is on.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {batches.map((batch, idx) => (
            <div key={batch.id} data-testid="suggestion-batch">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="mono text-[10px] uppercase tracking-wider text-neutral-400">
                  {idx === 0 ? "Latest" : formatTime(batch.timestamp)}
                </span>
                {idx === 0 && (
                  <span className="mono text-[10px] text-neutral-400">· {formatTime(batch.timestamp)}</span>
                )}
                <div className="h-px flex-1 bg-neutral-200" />
              </div>
              <div className="space-y-2">
                {batch.suggestions.map((s, i) => (
                  <Card key={`${batch.id}-${i}`} suggestion={s} onClick={onCardClick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div
          data-testid="suggestions-error"
          className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}
    </section>
  );
}
