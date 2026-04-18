# TwinMind · Live Meeting Copilot

A web app that listens to live audio from the user's mic and continuously surfaces
**three** useful suggestions based on what is being said, with a full-transcript-aware
chat on the right.

Transcription: **Groq Whisper Large V3**.
Suggestions, expanded answers and chat: **Groq `openai/gpt-oss-120b`**.
The user provides their own Groq API key (pasted into Settings, stored only in
`localStorage`).

```
┌──────────────────┬──────────────────┬───────────────────┐
│ Transcript       │ Live suggestions │ Chat              │
│ · mic start/stop │ · 3 cards/batch  │ · click a card or │
│ · ~30s chunks    │ · auto-refresh   │   type a question │
│ · auto-scroll    │ · newest on top  │ · session only    │
└──────────────────┴──────────────────┴───────────────────┘
```

---

## Stack

- **Frontend**: React 19, Tailwind + shadcn/ui, Axios, Sonner (toasts), Lucide icons.
  Fonts: *Instrument Sans* + *JetBrains Mono*.
- **Backend**: FastAPI + httpx (async) as a thin, stateless proxy to Groq.
  No database. No persistence. No secrets on the server.
- **Audio capture**: browser `MediaRecorder` producing self-contained 30-second
  WebM/Opus blobs (see *Audio chunking* below).

---

## Running locally

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001

# frontend
cd frontend
yarn install
yarn start
```

Frontend reads `REACT_APP_BACKEND_URL` from `frontend/.env` — set it to your backend
host (e.g. `http://localhost:8001` locally). Backend has no required env beyond the
defaults shipped.

Open the app, click **Settings**, paste your Groq API key (grab one at
<https://console.groq.com/keys>), save, then click the mic.

---

## Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────┐
│  React app (browser)         │        │  FastAPI backend           │
│  · localStorage: key+prompts │        │  · stateless proxy         │
│  · MediaRecorder 30s chunks  │ ─────▶ │  POST /api/transcribe      │ ───▶  Groq Whisper Large V3
│  · in-memory session state   │ ─────▶ │  POST /api/suggestions     │ ───▶  Groq gpt-oss-120b
│  · click card / type chat    │ ─────▶ │  POST /api/expand          │ ───▶  Groq gpt-oss-120b
│                              │ ─────▶ │  POST /api/chat            │ ───▶  Groq gpt-oss-120b
└──────────────────────────────┘        └────────────────────────────┘
```

Every request includes the user's Groq API key in the JSON body (or multipart form
for audio). The backend never logs, stores, or caches it — it is used only to form
the `Authorization: Bearer …` header for the Groq call.

---

## Prompt strategy

These defaults are hardcoded in `frontend/src/lib/prompts.js` and editable in the
**Settings → Prompts** tab. Every prompt change is applied on the very next call.

### Live-suggestions prompt

The key moves:

1. **Five named suggestion types** (`question`, `talking_point`, `answer`,
   `fact_check`, `clarification`) with tight instructions for when each is
   appropriate. We tell the model explicitly *not* to force variety — the right
   three for this moment may all be the same type.
2. **Stand-alone previews** — the preview alone must deliver value; no teasers.
   1–2 tight sentences, action-first titles ≤ 6 words.
3. **Recency weighting** — the last 60s of transcript dominates.
4. **Previous-batch memory** — we pass a compact list of types used in the last
   two batches so the model can build on them rather than repeat.
5. **JSON mode** via Groq's `response_format: json_object` — the response is parsed
   and normalized on the backend before the frontend ever sees it. Bad JSON =
   `502` + visible error banner, never a broken card.

### Expanded-answer prompt

Runs only when the user clicks a card. Sees the **full available transcript** (up
to the configured context window) + the card itself. Tells the model to:

- Lead with a one-sentence TL;DR.
- Follow with 3–5 concrete bullets.
- End with a "use this in the next 30 seconds" line.
- No "as an AI" disclaimers, no restating the title.
- Branch on `type`: fact-checks show the claim + verification; questions explain
  why *this* question *now*; answers are complete enough to read aloud.

### Chat prompt

Injects the full transcript into the system message, then appends the full chat
history. Style: direct, specific, quotes from the transcript when relevant, still
useful for off-topic questions. One continuous chat per session.

### Context windows

Measured in **characters**, not tokens, so they work without a tokenizer in the
browser. Defaults:

| Use | Default | Why |
|---|---|---|
| Live suggestions | 6 000 chars | ~1 500 tokens. Biases the model to recency and keeps calls cheap at 30s cadence. |
| Expanded answers | 20 000 chars | ~5 000 tokens. Enough to quote across the whole meeting for most sessions. |
| Chat | 20 000 chars | Same reasoning as expanded. |

Backed off with the trailing-ellipsis convention (`…<last N chars>`) so the model
knows the transcript is truncated.

---

## Audio chunking

`MediaRecorder`'s timeslice mode produces fragments that are **not** individually
decodable — only the first has the WebM/Matroska header. Groq's Whisper endpoint
rejects these with a decode error.

Our `useRecorder` hook instead runs a *restart loop*: start a fresh
`MediaRecorder`, stop it after 30 seconds, collect its single self-contained blob,
and immediately start another one. Each blob is a valid, standalone WebM file
around 90–250 KB — well under Groq's 25 MB limit.

A **Refresh** button on the suggestions column also force-flushes the current
in-flight chunk early (`recorder.stop()`) so a manual refresh sees the latest
speech rather than waiting up to 30 seconds.

---

## Latency budget

On a warm Groq tier (Developer), with default prompts:

| Step | Typical |
|---|---|
| Mic click → first transcript chunk shown | ~31–33 s (30 s recording + ~1 s transcribe) |
| Transcript chunk → 3 suggestions rendered | ~1.5–2.5 s |
| Manual **Refresh** click → suggestions rendered | ~2–4 s (flush + transcribe + suggestions) |
| Suggestion card click → first assistant token | ~1–2 s (non-streaming; Groq ~500 tok/s so full answer arrives in ~2–3 s) |
| Chat send → first assistant token | ~1–2 s |

Suggestions and chat are not streamed on purpose: at Groq's speed the full
response arrives in ~2 s and streaming adds complexity for little perceptible win,
given we want the *card* to render atomically (partial JSON is unrenderable).

---

## Tradeoffs

- **No streaming for chat.** Trades ~1 s of "first-token" latency for atomic,
  easy-to-export messages and simpler error handling. Would revisit for long-form
  answers >600 tokens.
- **Characters, not tokens.** We don't ship a tokenizer to the browser; 4 chars ≈
  1 token is accurate enough for `gpt-oss-120b`'s 131k-token context window.
- **No persistence.** Spec says session-only. Reload wipes everything (by design).
- **Single model for everyone.** Whisper Large V3 + `gpt-oss-120b` are hard-coded
  server-side so prompt quality is what's being compared, per the spec.
- **Backend is a proxy, nothing more.** Could be a Vercel/Cloudflare function; we
  keep it as a FastAPI service so the user-provided key never touches a browser
  origin that isn't ours.

---

## API surface

All endpoints prefixed with `/api`.

```
POST /api/transcribe          multipart: file, api_key, language?     → { text }
POST /api/suggestions         json: { api_key, transcript, prompt,
                                      context_window_chars,
                                      previous_batches }              → { suggestions: [3× {type, title, preview}] }
POST /api/expand              json: { api_key, transcript, prompt,
                                      context_window_chars,
                                      suggestion }                    → { answer }
POST /api/chat                json: { api_key, transcript, prompt,
                                      context_window_chars,
                                      messages }                      → { answer }
```

Errors are mapped: `401` → "Invalid Groq API key", `429` → rate-limit banner,
anything else → `502` with the Groq error message passed through.

---

## Export

Top-right **Export** button downloads a JSON file:

```json
{
  "exported_at": "2026-02-…Z",
  "transcript": [{ "timestamp": "…", "text": "…" }],
  "suggestion_batches": [
    { "timestamp": "…", "suggestions": [ {type, title, preview} x3 ] }
  ],
  "chat": [
    { "timestamp": "…", "role": "user|assistant",
      "content": "…", "from_suggestion": true }
  ]
}
```

Batches are written oldest-first for readability even though the UI shows them
newest-first.

---

## Project layout

```
backend/
  server.py              FastAPI app, all 4 routes, Groq proxy helpers
  requirements.txt       pinned deps (httpx, fastapi, …)
  .env                   MONGO_URL/DB_NAME are kept but unused

frontend/
  src/
    App.js               top-level state machine, wires the 3 columns
    lib/
      api.js             axios wrappers for the 4 backend routes
      prompts.js         default prompts + context-window constants
    hooks/
      useRecorder.js     30s self-contained chunk recorder
    components/
      TopBar.jsx
      TranscriptColumn.jsx
      SuggestionsColumn.jsx
      ChatColumn.jsx
      SettingsDialog.jsx
      ui/                shadcn primitives (unchanged)
```

---

## Deploying

Pick any host that runs a Python backend + serves a static React build. Simplest:

- **Render** (backend as Web Service, frontend as Static Site pointing at the
  backend URL via `REACT_APP_BACKEND_URL`).
- **Railway / Fly.io** for both sides.
- **Vercel** for the frontend + **Render/Fly** for the backend.

No secrets to configure — the Groq key is user-supplied at runtime.
