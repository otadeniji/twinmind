# TwinMind · Live Meeting Copilot — PRD

## Original problem statement

Build a web app that listens to live audio from the user's mic and continuously
surfaces 3 useful suggestions based on what is being said. Clicking a suggestion
opens a detailed answer in a chat panel on the right. Models: Groq Whisper
Large V3 (transcription) + Groq `openai/gpt-oss-120b` (suggestions + chat).
Same models for everyone — we are compared on prompt quality.

## User choices (confirmed 2026-02)

- User-provided Groq API key only (no fallback server key)
- 30s browser-side MediaRecorder chunks
- Match reference Claude-artifact 3-column layout
- Session-only, no persistence
- User will deploy themselves (Vercel/Render/Fly)

## Architecture

```
Browser (React 19)
  ├── MediaRecorder — 30s self-contained WebM/Opus blobs
  ├── localStorage — Groq key + editable prompts only
  └── Axios → FastAPI backend (thin proxy) → Groq
       /api/transcribe         multipart  → whisper-large-v3
       /api/suggestions        JSON mode  → gpt-oss-120b  (3 structured cards)
       /api/expand             JSON       → gpt-oss-120b  (detailed answer)
       /api/chat               JSON       → gpt-oss-120b  (free-form)
```

## Implemented (2026-02)

- ✅ 3-column layout (Transcript | Live Suggestions | Chat) with top bar (Settings, Export)
- ✅ Mic start/stop with 30s restart-loop chunker (each blob self-decodable by Whisper)
- ✅ Transcript auto-scroll, per-chunk timestamp, pending-chunks indicator
- ✅ Live suggestions: auto-refresh at configurable interval (30s default), manual Refresh button that force-flushes the in-flight chunk, newest batch on top, 3 cards per batch with type-colored badges (question / talking_point / answer / fact_check / clarification)
- ✅ Clicking a card adds it to the chat as a user message and fetches an expanded answer
- ✅ Free-form chat with full-transcript context and one continuous thread
- ✅ Settings dialog: Groq key (reveal/hide), editable system prompts for all 3 calls, context-window char limits, auto-refresh cadence, reset-to-defaults
- ✅ Export as JSON (transcript + all batches + chat, timestamped)
- ✅ Prompt strategy: 5 named suggestion types, JSON-mode structured output, recency-weighted context, previous-batch memory, stand-alone previews
- ✅ Backend error mapping: 401/429/validation/file-size/timeout → human-readable details
- ✅ Instrument Sans + JetBrains Mono typography; clean light theme; no prohibited gradients
- ✅ README with stack, prompt strategy, tradeoffs, latency budget, deployment notes
- ✅ 29/29 backend validation tests pass (testing agent iteration_1)

## Not implemented / deferred

- ⏳ Streaming chat responses (SSE) — Groq is already ~500 tok/s so full answers arrive in ~2s; streaming would add complexity for marginal UX win
- ⏳ Live partial-transcript display (we show full 30s chunks only, not mid-chunk text)
- ⏳ Speaker diarization
- ⏳ Pause/resume the recorder (only start/stop supported)
- ⏳ Deployment — user will do this (README covers options)

## P0 / P1 / P2 backlog

**P0 (blocking real usage)**
- None — app is functional end-to-end once a Groq key is pasted.

**P1 (meaningful polish)**
- Streaming SSE chat/expand responses.
- Partial-transcript preview of the currently-recording 30s window.
- "Copy link to this card" → prefilled chat question.
- Keyboard shortcut for mic toggle (e.g. ⌘⇧R).

**P2**
- Multi-session history (would require persistence opt-in).
- Speaker labels via a separate diarization model.
- Retry logic for transient Groq 429s with exponential backoff visible to the user.

## Test credentials

No auth. User pastes their own Groq key at runtime. See `/app/memory/test_credentials.md`.
