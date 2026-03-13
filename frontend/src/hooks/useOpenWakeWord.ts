"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/constants";

type FallbackMode = "custom" | "push-to-talk";

interface UseOpenWakeWordReturn {
  isLoaded: boolean;
  fallbackMode: FallbackMode;
  error: string | null;
  startListening: (stream: MediaStream) => Promise<void>;
  stopListening: () => void;
  onKeywordDetected: (callback: () => void) => void;
  triggerManual: () => void;
  sendAudio: (samples: Int16Array) => void;
}

export function useOpenWakeWord(): UseOpenWakeWordReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<FallbackMode>("push-to-talk");
  const [error, setError] = useState<string | null>(null);

  const callbackRef = useRef<(() => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const onKeywordDetected = useCallback((callback: () => void) => {
    callbackRef.current = callback;
  }, []);

  const triggerManual = useCallback(() => {
    callbackRef.current?.();
  }, []);

  const sendAudio = useCallback((samples: Int16Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(samples.buffer);
    }
  }, []);

  const startListening = useCallback(async (_stream: MediaStream) => {
    try {
      const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/api/wakeword";
      const ws = new WebSocket(wsUrl);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[OpenWakeWord] WebSocket connected");
        wsRef.current = ws;
        setFallbackMode("custom");
        setIsLoaded(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "wake_word_detected") {
            console.log("[OpenWakeWord] Detected!", data.score);
            callbackRef.current?.();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = (err) => {
        console.error("[OpenWakeWord] WebSocket error:", err);
        setError("Wake word WebSocket error");
        setFallbackMode("push-to-talk");
        setIsLoaded(true);
      };

      ws.onclose = () => {
        console.log("[OpenWakeWord] WebSocket closed");
        wsRef.current = null;
      };
    } catch (err) {
      console.warn("OpenWakeWord init failed, using push-to-talk:", err);
      setFallbackMode("push-to-talk");
      setIsLoaded(true);
      setError("Wake word indisponible - mode push-to-talk");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsLoaded(false);
  }, []);

  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  return {
    isLoaded,
    fallbackMode,
    error,
    startListening,
    stopListening,
    onKeywordDetected,
    triggerManual,
    sendAudio,
  };
}
