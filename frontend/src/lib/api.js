import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function transcribeChunk({ blob, apiKey, mimeType, signal }) {
  const form = new FormData();
  const ext = mimeType?.includes("webm") ? "webm" : mimeType?.includes("mp4") ? "mp4" : "webm";
  form.append("file", blob, `chunk.${ext}`);
  form.append("api_key", apiKey);
  const { data } = await axios.post(`${BASE}/transcribe`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    signal,
  });
  return data.text || "";
}

export async function fetchSuggestions({ apiKey, transcript, prompt, contextWindow, previousBatches, signal }) {
  const { data } = await axios.post(
    `${BASE}/suggestions`,
    {
      api_key: apiKey,
      transcript,
      prompt,
      context_window_chars: contextWindow,
      previous_batches: previousBatches,
    },
    { timeout: 60000, signal },
  );
  return data.suggestions || [];
}

export async function expandSuggestion({ apiKey, transcript, prompt, contextWindow, suggestion, signal }) {
  const { data } = await axios.post(
    `${BASE}/expand`,
    {
      api_key: apiKey,
      transcript,
      prompt,
      context_window_chars: contextWindow,
      suggestion,
    },
    { timeout: 60000, signal },
  );
  return data.answer || "";
}

export async function sendChat({ apiKey, transcript, prompt, contextWindow, messages, signal }) {
  const { data } = await axios.post(
    `${BASE}/chat`,
    {
      api_key: apiKey,
      transcript,
      prompt,
      context_window_chars: contextWindow,
      messages,
    },
    { timeout: 60000, signal },
  );
  return data.answer || "";
}

export function extractErrorMessage(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (err?.message) return err.message;
  return "Request failed";
}
