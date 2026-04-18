import { useEffect, useRef, useState } from "react";
import { Send, Loader2, MessageCircle, User2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatColumn({ messages, loading, onSend, error, canSend }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !canSend || loading) return;
    setDraft("");
    onSend(text);
  };

  return (
    <section data-testid="chat-column" className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
        <h2 className="heading text-sm font-medium tracking-wide text-neutral-900">Chat</h2>
        <span className="mono text-[10px] uppercase tracking-wider text-neutral-400">
          session only
        </span>
      </div>

      <div ref={scrollRef} data-testid="chat-scroll" className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-neutral-500">
            <MessageCircle className="mb-3 h-8 w-8 text-neutral-300" />
            <p className="max-w-[30ch] leading-relaxed">
              Click a suggestion card or type a question. Answers use the full transcript as context.
            </p>
          </div>
        )}

        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} data-testid="chat-message" data-role={m.role} className="flex gap-3">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  m.role === "user" ? "bg-neutral-900 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {m.role === "user" ? <User2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="heading text-xs font-medium text-neutral-900">
                    {m.role === "user" ? "You" : "TwinMind"}
                  </span>
                  <span className="mono text-[10px] text-neutral-400">{fmtTime(m.timestamp)}</span>
                  {m.fromSuggestion && (
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-500">
                      from suggestion
                    </span>
                  )}
                </div>
                {m.pending ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                    {m.content}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div
          data-testid="chat-error"
          className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={canSend ? "Ask anything about the meeting…" : "Add your Groq API key in Settings to chat"}
            disabled={!canSend}
            className="min-h-[44px] max-h-40 resize-none"
          />
          <Button
            data-testid="chat-send-btn"
            onClick={submit}
            disabled={!canSend || !draft.trim() || loading}
            size="icon"
            className="h-10 w-10 shrink-0 bg-neutral-900 text-white hover:bg-neutral-800"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
