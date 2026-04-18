"""
TwinMind-style live meeting copilot backend.

Proxies user-provided Groq API key to:
  - Whisper Large V3 for transcription
  - openai/gpt-oss-120b for live suggestions, expanded answers, and chat.

No persistence: the backend is stateless. Session state lives entirely in the browser.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

GROQ_API_BASE = "https://api.groq.com/openai/v1"
WHISPER_MODEL = "whisper-large-v3"
LLM_MODEL = "openai/gpt-oss-120b"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # Groq Whisper direct-upload limit

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("twinmind")

app = FastAPI(title="TwinMind Live Copilot API")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class SuggestionsRequest(BaseModel):
    api_key: str
    transcript: str = ""
    prompt: str
    context_window_chars: int = Field(default=6000, ge=500, le=40000)
    previous_batches: List[dict] = Field(default_factory=list)


class ExpandRequest(BaseModel):
    api_key: str
    transcript: str = ""
    prompt: str
    context_window_chars: int = Field(default=20000, ge=500, le=80000)
    suggestion: dict


class ChatRequest(BaseModel):
    api_key: str
    transcript: str = ""
    prompt: str
    messages: List[ChatMessage]
    context_window_chars: int = Field(default=20000, ge=500, le=80000)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tail(text: str, n: int) -> str:
    """Return last n characters of text (most recent context)."""
    if not text:
        return ""
    return text if len(text) <= n else "…" + text[-n:]


def _groq_error(status: int, body: str) -> HTTPException:
    try:
        parsed = json.loads(body)
        msg = parsed.get("error", {}).get("message") or body
    except Exception:
        msg = body
    if status == 401:
        return HTTPException(status_code=401, detail=f"Invalid Groq API key: {msg}")
    if status == 429:
        return HTTPException(status_code=429, detail=f"Groq rate limit: {msg}")
    return HTTPException(status_code=502, detail=f"Groq error {status}: {msg}")


async def _groq_chat(api_key: str, messages: list, *, json_mode: bool = False,
                     temperature: float = 0.7, max_tokens: int = 1024) -> str:
    """Call Groq chat completions and return assistant content string."""
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "stream": False,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            r = await client.post(f"{GROQ_API_BASE}/chat/completions", json=payload, headers=headers)
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Groq request timed out")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Groq network error: {e}")

    if r.status_code >= 400:
        raise _groq_error(r.status_code, r.text)

    data = r.json()
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail=f"Unexpected Groq response: {data}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@api.get("/")
async def root():
    return {"service": "twinmind-live-copilot", "status": "ok"}


@api.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    language: Optional[str] = Form(None),
):
    """Proxy a single audio chunk to Groq Whisper Large V3."""
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    blob = await file.read()
    if not blob:
        return {"text": ""}
    if len(blob) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio chunk exceeds 25MB limit")

    files = {"file": (file.filename or "chunk.webm", blob, file.content_type or "audio/webm")}
    data = {
        "model": WHISPER_MODEL,
        "response_format": "json",
        "temperature": "0",
    }
    if language:
        data["language"] = language

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            r = await client.post(
                f"{GROQ_API_BASE}/audio/transcriptions",
                files=files, data=data, headers=headers,
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Transcription timed out")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Groq network error: {e}")

    if r.status_code >= 400:
        raise _groq_error(r.status_code, r.text)

    resp = r.json()
    return {"text": (resp.get("text") or "").strip()}


@api.post("/suggestions")
async def suggestions(req: SuggestionsRequest):
    """Produce exactly 3 context-aware live suggestions as structured JSON."""
    if not req.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    recent = _tail(req.transcript, req.context_window_chars)

    # Compact summary of previous batch types to encourage variety.
    prev_types: list[str] = []
    for batch in req.previous_batches[-2:]:
        for s in batch.get("suggestions", []):
            t = s.get("type")
            if t:
                prev_types.append(t)
    prev_hint = ", ".join(prev_types[-9:]) if prev_types else "none"

    system = req.prompt.strip() + (
        "\n\nYou MUST respond with a single JSON object of this exact shape:\n"
        '{"suggestions": [{"type": "<one of: question|talking_point|answer|fact_check|clarification>",'
        ' "title": "<max 6 words>", "preview": "<1-2 sentences, stand-alone useful>"}, ...3 items]}\n'
        "Return ONLY the JSON, no prose."
    )

    user = (
        f"Recent transcript (most recent at end):\n---\n{recent or '(no speech yet)'}\n---\n\n"
        f"Types used in previous batches (prefer variety): {prev_hint}.\n"
        "Produce exactly 3 suggestions that would be MOST useful to surface RIGHT NOW. "
        "Each preview must deliver real value on its own without being clicked."
    )

    content = await _groq_chat(
        req.api_key,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        json_mode=True, temperature=0.6, max_tokens=700,
    )

    try:
        parsed = json.loads(content)
        items = parsed.get("suggestions") or parsed.get("items") or []
        if not isinstance(items, list) or not items:
            raise ValueError("missing suggestions array")
        normalized = []
        for s in items[:3]:
            normalized.append({
                "type": str(s.get("type", "talking_point")).lower().strip(),
                "title": str(s.get("title", "")).strip()[:80],
                "preview": str(s.get("preview", "")).strip(),
            })
        while len(normalized) < 3:
            normalized.append({"type": "talking_point", "title": "More context needed",
                               "preview": "Keep talking — more suggestions will appear as context grows."})
        return {"suggestions": normalized}
    except Exception as e:
        logger.warning(f"Failed to parse suggestions JSON: {e}\nRaw: {content[:500]}")
        raise HTTPException(status_code=502, detail="Model returned invalid JSON for suggestions")


@api.post("/expand")
async def expand(req: ExpandRequest):
    """Produce a detailed answer for a clicked suggestion card."""
    if not req.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    recent = _tail(req.transcript, req.context_window_chars)
    s = req.suggestion or {}
    card = (
        f"Type: {s.get('type', 'talking_point')}\n"
        f"Title: {s.get('title', '')}\n"
        f"Preview: {s.get('preview', '')}"
    )
    user = (
        f"Full meeting transcript so far (most recent at end):\n---\n{recent or '(empty)'}\n---\n\n"
        f"Suggestion card the user just clicked:\n---\n{card}\n---\n\n"
        "Write a detailed, immediately-useful answer tailored to this exact moment in the conversation."
    )
    content = await _groq_chat(
        req.api_key,
        [{"role": "system", "content": req.prompt.strip()}, {"role": "user", "content": user}],
        temperature=0.5, max_tokens=900,
    )
    return {"answer": content.strip()}


@api.post("/chat")
async def chat(req: ChatRequest):
    """Free-form chat with the meeting as context."""
    if not req.api_key:
        raise HTTPException(status_code=400, detail="api_key is required")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    recent = _tail(req.transcript, req.context_window_chars)
    system = req.prompt.strip() + (
        f"\n\n--- MEETING TRANSCRIPT SO FAR (most recent at end) ---\n"
        f"{recent or '(empty)'}\n--- END TRANSCRIPT ---"
    )
    msgs = [{"role": "system", "content": system}]
    msgs.extend({"role": m.role, "content": m.content} for m in req.messages)

    content = await _groq_chat(req.api_key, msgs, temperature=0.5, max_tokens=900)
    return {"answer": content.strip()}


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
