"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PORCUPINE_ACCESS_KEY } from "@/lib/constants";

type FallbackMode = "custom" | "builtin" | "push-to-talk";

interface UsePorcupineReturn {
  isLoaded: boolean;
  fallbackMode: FallbackMode;
  error: string | null;
  startListening: (stream: MediaStream) => Promise<void>;
  stopListening: () => void;
  onKeywordDetected: (callback: () => void) => void;
  triggerManual: () => void;
}

export function usePorcupine(): UsePorcupineReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [fallbackMode, setFallbackMode] =
    useState<FallbackMode>("push-to-talk");
  const [error, setError] = useState<string | null>(null);

  const callbackRef = useRef<(() => void) | null>(null);
  const porcupineRef = useRef<unknown>(null);

  const onKeywordDetected = useCallback((callback: () => void) => {
    callbackRef.current = callback;
  }, []);

  const triggerManual = useCallback(() => {
    callbackRef.current?.();
  }, []);

  const startListening = useCallback(async (_stream: MediaStream) => {
    if (!PORCUPINE_ACCESS_KEY) {
      setFallbackMode("push-to-talk");
      setIsLoaded(true);
      setError("Clé Porcupine non configurée — mode push-to-talk");
      return;
    }

    try {
      const { Porcupine, BuiltInKeyword } = await import(
        "@picovoice/porcupine-web"
      );
      const { WebVoiceProcessor } = await import(
        "@picovoice/web-voice-processor"
      );

      let porcupine;
      let mode: FallbackMode = "push-to-talk";

      // 1. Try custom "Aura" keyword first
      try {
        porcupine = await Porcupine.create(
          PORCUPINE_ACCESS_KEY,
          [{ publicPath: "/porcupine/Aura-test_fr_wasm_v4_0_0.ppn", label: "aura" }],
          () => {
            callbackRef.current?.();
          },
          { publicPath: "/porcupine/porcupine_params_fr.pv", forceWrite: true }
        );
        mode = "custom";
      } catch (customErr) {
        console.warn("Custom keyword 'Aura' failed, trying built-in:", customErr);

        // 2. Fallback to built-in keyword "Computer"
        porcupine = await Porcupine.create(
          PORCUPINE_ACCESS_KEY,
          [BuiltInKeyword.Computer],
          () => {
            callbackRef.current?.();
          },
          { publicPath: "/porcupine/porcupine_params_fr.pv", forceWrite: true }
        );
        mode = "builtin";
      }

      porcupineRef.current = porcupine;
      setFallbackMode(mode);

      // Subscribe porcupine to WebVoiceProcessor
      await WebVoiceProcessor.subscribe(porcupine);
      setIsLoaded(true);
    } catch (err) {
      console.warn("Porcupine init failed, using push-to-talk:", err);
      setFallbackMode("push-to-talk");
      setIsLoaded(true);
      setError("Wake word indisponible — mode push-to-talk");
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      if (porcupineRef.current) {
        const { WebVoiceProcessor } = await import(
          "@picovoice/web-voice-processor"
        );
        await WebVoiceProcessor.unsubscribe(porcupineRef.current);
        const prc = porcupineRef.current as { release: () => Promise<void> };
        await prc.release();
        porcupineRef.current = null;
      }
    } catch {
      // Ignore cleanup errors
    }
    setIsLoaded(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isLoaded,
    fallbackMode,
    error,
    startListening,
    stopListening,
    onKeywordDetected,
    triggerManual,
  };
}
