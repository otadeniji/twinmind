import { useEffect, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtElapsed(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}

export function TranscriptColumn({
  chunks,
  recording,
  elapsed,
  pendingCount,
  error,
  onToggle,
  canRecord,
}) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks.length, pendingCount]);

  return (
    <section
      data-testid="transcript-column"
      className="flex h-full min-h-0 flex-col border-r border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="heading text-sm font-medium tracking-wide text-neutral-900">Transcript</h2>
          {recording && (
            <span
              data-testid="recording-indicator"
              className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-700"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Rec · <span className="mono">{fmtElapsed(elapsed)}</span>
            </span>
          )}
        </div>
        <Button
          data-testid="mic-toggle-btn"
          onClick={onToggle}
          disabled={!canRecord}
          size="sm"
          className={
            recording
              ? "gap-1.5 bg-red-600 text-white hover:bg-red-700"
              : "gap-1.5 bg-neutral-900 text-white hover:bg-neutral-800"
          }
        >
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording ? "Stop" : "Start"}
        </Button>
      </div>

      <div
        ref={scrollRef}
        data-testid="transcript-scroll"
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {chunks.length === 0 && !recording && !pendingCount && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-neutral-500">
            <Mic className="mb-3 h-8 w-8 text-neutral-300" />
            <p className="max-w-[28ch] leading-relaxed">
              Click <span className="font-medium text-neutral-700">Start</span> to begin recording.
              Transcript appends every ~30 seconds.
            </p>
          </div>
        )}

        {chunks.length === 0 && recording && pendingCount === 0 && (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Listening… first chunk arrives in ~30s.
          </div>
        )}

        <ul className="space-y-4">
          {chunks.map((c) => (
            <li key={c.id} data-testid="transcript-chunk" className="flex gap-3">
              <span className="mono mt-0.5 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">
                {fmtTime(c.timestamp)}
              </span>
              <p className="text-sm leading-relaxed text-neutral-800">{c.text}</p>
            </li>
          ))}
          {pendingCount > 0 && (
            <li data-testid="transcribing-row" className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Transcribing {pendingCount} chunk{pendingCount > 1 ? "s" : ""}…
            </li>
          )}
        </ul>
      </div>

      {error && (
        <div
          data-testid="transcript-error"
          className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}
    </section>
  );
}
