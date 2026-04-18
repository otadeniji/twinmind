import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 30-second-chunk audio recorder.
 * Strategy: start a fresh MediaRecorder, stop it after `chunkMs`, collect the single
 * resulting blob (fully playable/decodable), then immediately start another one.
 * This produces self-contained webm blobs that Groq Whisper can transcribe cleanly
 * (MediaRecorder's timeslice mode yields partial blobs that often fail to decode).
 */
export function useRecorder({ chunkMs = 30000, onChunk } = {}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunkBufferRef = useRef([]);
  const chunkTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const mimeTypeRef = useRef("audio/webm");
  const shouldContinueRef = useRef(false);
  const onChunkRef = useRef(onChunk);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const pickMime = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const t of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
    }
    return "";
  };

  const cycle = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !shouldContinueRef.current) return;

    const mime = mimeTypeRef.current;
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    recorderRef.current = rec;
    chunkBufferRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunkBufferRef.current.push(e.data);
    };
    rec.onstop = () => {
      const parts = chunkBufferRef.current;
      chunkBufferRef.current = [];
      if (parts.length > 0) {
        const blob = new Blob(parts, { type: mime || "audio/webm" });
        if (blob.size > 1024 && onChunkRef.current) {
          onChunkRef.current({ blob, mimeType: blob.type, at: Date.now() });
        }
      }
      if (shouldContinueRef.current) cycle();
    };

    rec.start();
    chunkTimerRef.current = setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    }, chunkMs);
  }, [chunkMs]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      mimeTypeRef.current = pickMime();
      shouldContinueRef.current = true;
      setRecording(true);
      setElapsed(0);
      elapsedTimerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      cycle();
    } catch (e) {
      setError(e?.message || "Microphone permission denied.");
    }
  }, [cycle]);

  const stop = useCallback(() => {
    shouldContinueRef.current = false;
    setRecording(false);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch {}
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Force-flush the current chunk early (used by the Refresh button).
  const flush = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      try { rec.stop(); } catch {}
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { recording, elapsed, error, start, stop, flush };
}
