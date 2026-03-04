"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSttToken } from "@/lib/api";
import { int16ToBase64 } from "@/lib/audioUtils";
import { contextBuffer } from "@/lib/contextBuffer";
import { TOKEN_REFRESH_MS } from "@/lib/constants";

interface UsePassiveSTTReturn {
  isConnected: boolean;
  currentPartial: string;
  transcriptCount: number;
  error: string | null;
  start: (sampleRate: number) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  sendAudioChunk: (samples: Int16Array, sampleRate: number) => void;
}

export function usePassiveSTT(): UsePassiveSTTReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [currentPartial, setCurrentPartial] = useState("");
  const [transcriptCount, setTranscriptCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isPausedRef = useRef(false);
  const sampleRateRef = useRef(48000);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppedRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 5;

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connectWebSocket = useCallback(
    async (sr: number) => {
      if (isStoppedRef.current) return;

      try {
        setError(null);
        const token = await fetchSttToken();

        const audioFormat =
          sr === 44100 ? "pcm_44100" : sr === 48000 ? "pcm_48000" : "pcm_16000";

        const params = new URLSearchParams({
          model_id: "scribe_v2_realtime",
          token,
          audio_format: audioFormat,
          language_code: "fr",
          commit_strategy: "vad",
          vad_silence_threshold_secs: "1.5",
          vad_threshold: "0.4",
          min_speech_duration_ms: "100",
          include_timestamps: "true",
        });

        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          switch (data.message_type) {
            case "session_started":
              retryCountRef.current = 0;
              setIsConnected(true);
              break;
            case "partial_transcript":
              if (data.text) setCurrentPartial(data.text);
              break;
            case "committed_transcript":
              // Ignore — we use committed_transcript_with_timestamps instead
              break;
            case "committed_transcript_with_timestamps":
              if (data.text) {
                contextBuffer.add(data.text);
                setTranscriptCount(contextBuffer.size);
                setCurrentPartial("");
              }
              break;
            // --- Error handling from docs ---
            case "auth_error":
              console.error("[STT-Passive] Auth error:", data.error);
              setError("Erreur authentification STT");
              break;
            case "quota_exceeded":
              console.error("[STT-Passive] Quota exceeded:", data.error);
              setError("Quota STT dépassé");
              isStoppedRef.current = true; // Don't retry
              break;
            case "rate_limited":
              console.warn("[STT-Passive] Rate limited:", data.error);
              break;
            case "session_time_limit_exceeded":
              console.warn("[STT-Passive] Session time limit, reconnecting...");
              closeWebSocket();
              connectWebSocket(sr);
              break;
            case "chunk_size_exceeded":
              console.warn("[STT-Passive] Chunk too large:", data.error);
              break;
            case "error":
            case "input_error":
            case "transcriber_error":
              console.error("[STT-Passive]", data.message_type, ":", data.error);
              break;
            default:
              break;
          }
        };

        ws.onerror = () => {
          setError("Connexion STT passive perdue");
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (!isStoppedRef.current && retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            const delay = Math.min(2000 * Math.pow(2, retryCountRef.current - 1), 30000);
            console.warn(`[STT-Passive] Reconnecting ${retryCountRef.current}/${MAX_RETRIES} in ${delay / 1000}s`);
            setTimeout(() => connectWebSocket(sr), delay);
          } else if (retryCountRef.current >= MAX_RETRIES) {
            setError("STT passif : trop de tentatives, arrêt");
          }
        };

        wsRef.current = ws;

        // Schedule token refresh before expiry
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          closeWebSocket();
          connectWebSocket(sr);
        }, TOKEN_REFRESH_MS);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur connexion STT passive"
        );
        if (!isStoppedRef.current && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          const delay = Math.min(5000 * Math.pow(2, retryCountRef.current - 1), 60000);
          console.warn(`[STT-Passive] Retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay / 1000}s`);
          setTimeout(() => connectWebSocket(sr), delay);
        }
      }
    },
    [closeWebSocket]
  );

  const start = useCallback(
    async (sampleRate: number) => {
      isStoppedRef.current = false;
      isPausedRef.current = false;
      sampleRateRef.current = sampleRate;
      await connectWebSocket(sampleRate);
    },
    [connectWebSocket]
  );

  const stop = useCallback(() => {
    isStoppedRef.current = true;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    closeWebSocket();
    setCurrentPartial("");
  }, [closeWebSocket]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const sendAudioChunk = useCallback(
    (samples: Int16Array, _sampleRate: number) => {
      if (
        isPausedRef.current ||
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      const base64 = int16ToBase64(samples);
      wsRef.current.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: base64,
          commit: false,
          sample_rate: sampleRateRef.current,
        })
      );
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isStoppedRef.current = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      closeWebSocket();
    };
  }, [closeWebSocket]);

  return {
    isConnected,
    currentPartial,
    transcriptCount,
    error,
    start,
    stop,
    pause,
    resume,
    sendAudioChunk,
  };
}
