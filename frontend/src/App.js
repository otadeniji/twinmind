import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

import "./App.css";
import { TopBar } from "./components/TopBar";
import { TranscriptColumn } from "./components/TranscriptColumn";
import { SuggestionsColumn } from "./components/SuggestionsColumn";
import { ChatColumn } from "./components/ChatColumn";
import { SettingsDialog } from "./components/SettingsDialog";
import { useRecorder } from "./hooks/useRecorder";
import {
  defaultSettings,
  STORAGE_KEYS,
} from "./lib/prompts";
import {
  transcribeChunk,
  fetchSuggestions,
  expandSuggestion,
  sendChat,
  extractErrorMessage,
} from "./lib/api";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadApiKey() {
  try { return localStorage.getItem(STORAGE_KEYS.apiKey) || ""; } catch { return ""; }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { return defaultSettings(); }
}

export default function App() {
  // ---- persisted config ------------------------------------------------
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(!loadApiKey());

  // ---- session state ---------------------------------------------------
  const [chunks, setChunks] = useState([]);            // transcript chunks
  const [pendingChunks, setPendingChunks] = useState(0);
  const [transcriptError, setTranscriptError] = useState(null);

  const [batches, setBatches] = useState([]);          // suggestion batches (newest first)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(null);

  const [messages, setMessages] = useState([]);        // chat messages
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  const apiKeyRef = useRef(apiKey);
  const settingsRef = useRef(settings);
  const chunksRef = useRef(chunks);
  const batchesRef = useRef(batches);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { chunksRef.current = chunks; }, [chunks]);
  useEffect(() => { batchesRef.current = batches; }, [batches]);

  const hasKey = !!apiKey.trim();
  const fullTranscript = useMemo(
    () => chunks.map((c) => c.text).join(" ").trim(),
    [chunks],
  );

  // ---- persistence of config only --------------------------------------
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.apiKey, apiKey); } catch {}
  }, [apiKey]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // ---- transcription pipeline -----------------------------------------
  const handleAudioChunk = useCallback(async ({ blob, mimeType }) => {
    const key = apiKeyRef.current.trim();
    if (!key) {
      setTranscriptError("Missing Groq API key — open Settings.");
      return;
    }
    setPendingChunks((n) => n + 1);
    try {
      const text = await transcribeChunk({ blob, apiKey: key, mimeType });
      if (text && text.trim()) {
        setChunks((prev) => [...prev, { id: uid(), text: text.trim(), timestamp: Date.now() }]);
      }
      setTranscriptError(null);
    } catch (err) {
      setTranscriptError(extractErrorMessage(err));
    } finally {
      setPendingChunks((n) => Math.max(0, n - 1));
    }
  }, []);

  const { recording, elapsed, error: recError, start, stop, flush } = useRecorder({
    chunkMs: 30000,
    onChunk: handleAudioChunk,
  });

  const toggleMic = async () => {
    if (!hasKey) {
      toast.error("Add your Groq API key in Settings first.");
      setSettingsOpen(true);
      return;
    }
    if (recording) stop();
    else await start();
  };

  // ---- suggestions pipeline -------------------------------------------
  const suggestionsInFlight = useRef(null);

  const runSuggestions = useCallback(async () => {
    const key = apiKeyRef.current.trim();
    if (!key) return;
    const transcript = chunksRef.current.map((c) => c.text).join(" ").trim();
    if (!transcript) return;

    if (suggestionsInFlight.current) suggestionsInFlight.current.abort();
    const ctrl = new AbortController();
    suggestionsInFlight.current = ctrl;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    try {
      const items = await fetchSuggestions({
        apiKey: key,
        transcript,
        prompt: settingsRef.current.suggestionPrompt,
        contextWindow: settingsRef.current.contextLive,
        previousBatches: batchesRef.current.slice(0, 2),
        signal: ctrl.signal,
      });
      const batch = { id: uid(), timestamp: Date.now(), suggestions: items };
      setBatches((prev) => [batch, ...prev]);
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.name !== "AbortError") {
        setSuggestionsError(extractErrorMessage(err));
      }
    } finally {
      setSuggestionsLoading(false);
      suggestionsInFlight.current = null;
    }
  }, []);

  // Auto-refresh suggestions while recording, at configured cadence.
  useEffect(() => {
    if (!recording) return;
    const ms = Math.max(10, settings.refreshSeconds) * 1000;
    const id = setInterval(() => {
      runSuggestions();
    }, ms);
    return () => clearInterval(id);
  }, [recording, settings.refreshSeconds, runSuggestions]);

  // Also trigger a suggestions refresh each time a new transcript chunk lands
  // (but only if the time since the last batch is reasonable — avoids stampede).
  const lastAutoBatchRef = useRef(0);
  useEffect(() => {
    if (!recording || chunks.length === 0) return;
    const sinceLast = Date.now() - lastAutoBatchRef.current;
    if (sinceLast < 15000) return;
    lastAutoBatchRef.current = Date.now();
    runSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks.length]);

  const onManualRefresh = async () => {
    if (!hasKey) {
      toast.error("Add your Groq API key in Settings first.");
      setSettingsOpen(true);
      return;
    }
    // If currently recording, flush the in-flight chunk so the suggestions see the latest speech.
    if (recording) flush();
    await runSuggestions();
  };

  // ---- chat & expand pipelines ----------------------------------------
  const appendUserMessage = (content, extra = {}) => {
    const m = { id: uid(), role: "user", content, timestamp: Date.now(), ...extra };
    setMessages((prev) => [...prev, m]);
    return m;
  };
  const appendPendingAssistant = () => {
    const m = { id: uid(), role: "assistant", content: "", timestamp: Date.now(), pending: true };
    setMessages((prev) => [...prev, m]);
    return m.id;
  };
  const resolveAssistant = (id, content) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, pending: false } : m)));
  };
  const removeMessage = (id) => setMessages((prev) => prev.filter((m) => m.id !== id));

  const handleChatSend = async (text) => {
    const key = apiKeyRef.current.trim();
    if (!key) { toast.error("Missing Groq API key."); setSettingsOpen(true); return; }

    appendUserMessage(text);
    const pendingId = appendPendingAssistant();
    const history = [...messages, { role: "user", content: text }]
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, content: m.content }));

    setChatLoading(true);
    setChatError(null);
    try {
      const answer = await sendChat({
        apiKey: key,
        transcript: fullTranscript,
        prompt: settings.chatPrompt,
        contextWindow: settings.contextChat,
        messages: history,
      });
      resolveAssistant(pendingId, answer);
    } catch (err) {
      removeMessage(pendingId);
      setChatError(extractErrorMessage(err));
    } finally {
      setChatLoading(false);
    }
  };

  const handleSuggestionClick = async (suggestion) => {
    const key = apiKeyRef.current.trim();
    if (!key) { toast.error("Missing Groq API key."); setSettingsOpen(true); return; }

    appendUserMessage(suggestion.title || suggestion.preview, {
      fromSuggestion: true,
      suggestionType: suggestion.type,
    });
    const pendingId = appendPendingAssistant();

    setChatLoading(true);
    setChatError(null);
    try {
      const answer = await expandSuggestion({
        apiKey: key,
        transcript: fullTranscript,
        prompt: settings.expandPrompt,
        contextWindow: settings.contextExpand,
        suggestion,
      });
      resolveAssistant(pendingId, answer);
    } catch (err) {
      removeMessage(pendingId);
      setChatError(extractErrorMessage(err));
    } finally {
      setChatLoading(false);
    }
  };

  // ---- export ----------------------------------------------------------
  const handleExport = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      transcript: chunks.map((c) => ({
        timestamp: new Date(c.timestamp).toISOString(),
        text: c.text,
      })),
      suggestion_batches: [...batches].reverse().map((b) => ({
        timestamp: new Date(b.timestamp).toISOString(),
        suggestions: b.suggestions,
      })),
      chat: messages.map((m) => ({
        timestamp: new Date(m.timestamp).toISOString(),
        role: m.role,
        content: m.content,
        from_suggestion: !!m.fromSuggestion,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinmind-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Session exported");
  };

  const saveSettings = ({ apiKey: newKey, settings: newSettings }) => {
    setApiKey(newKey);
    setSettings(newSettings);
    toast.success("Settings saved");
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-50 text-neutral-900">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={handleExport}
        hasKey={hasKey}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)]">
        <TranscriptColumn
          chunks={chunks}
          recording={recording}
          elapsed={elapsed}
          pendingCount={pendingChunks}
          error={recError || transcriptError}
          onToggle={toggleMic}
          canRecord={hasKey}
        />
        <SuggestionsColumn
          batches={batches}
          loading={suggestionsLoading}
          onRefresh={onManualRefresh}
          onCardClick={handleSuggestionClick}
          error={suggestionsError}
          canRefresh={hasKey}
        />
        <ChatColumn
          messages={messages}
          loading={chatLoading}
          onSend={handleChatSend}
          error={chatError}
          canSend={hasKey}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        apiKey={apiKey}
        settings={settings}
        onSave={saveSettings}
      />

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
