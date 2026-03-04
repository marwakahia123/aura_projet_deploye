"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/components/StatusBar";
import type { ConversationEntry } from "@/components/TranscriptPanel";
import { useAudioCapture } from "./useAudioCapture";
import { usePassiveSTT } from "./usePassiveSTT";
import { useCommandSTT } from "./useCommandSTT";
import { usePorcupine } from "./usePorcupine";
import { useAudioPlayer } from "./useAudioPlayer";
import { sendChat } from "@/lib/api";
import { contextBuffer } from "@/lib/contextBuffer";

interface UseAuraSessionReturn {
  state: AppState;
  volume: number;
  sampleRate: number;
  passivePartial: string;
  commandPartial: string;
  commandCommitted: string;
  passiveTranscriptCount: number;
  passiveEntries: { text: string; timestamp: Date }[];
  history: ConversationEntry[];
  fallbackMode: string;
  errors: string[];
  initialize: () => Promise<void>;
  triggerWakeWord: () => void;
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.value = 0.3;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Ignore beep errors
  }
}

export function useAuraSession(): UseAuraSessionReturn {
  const [state, setState] = useState<AppState>("initializing");
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [passiveEntries, setPassiveEntries] = useState<
    { text: string; timestamp: Date }[]
  >([]);

  const stateRef = useRef<AppState>("initializing");
  const audioRoutingRef = useRef<"passive" | "command">("passive");

  const audio = useAudioCapture();
  const passiveSTT = usePassiveSTT();
  const player = useAudioPlayer();
  const porcupine = usePorcupine();

  const handleCommandComplete = useCallback(
    async (command: string) => {
      console.log("[AURA] handleCommandComplete called, command:", command);
      if (!command.trim()) {
        console.log("[AURA] Empty command, returning to idle");
        setState("idle");
        stateRef.current = "idle";
        audioRoutingRef.current = "passive";
        passiveSTT.resume();
        return;
      }

      // Transition to thinking
      setState("thinking");
      stateRef.current = "thinking";

      try {
        const context = contextBuffer.getContext();
        console.log("[AURA] Sending to API:", { command, contextCount: context.length });
        const result = await sendChat(command, context);
        console.log("[AURA] API response:", { text: result.text?.substring(0, 100), hasAudio: !!result.audioBlob });

        // Add to history
        const entry: ConversationEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          command,
          response: result.text,
        };
        setHistory((prev) => [...prev, entry]);

        // Play TTS if available
        if (result.audioBlob && result.audioBlob.size > 0) {
          setState("speaking");
          stateRef.current = "speaking";
          await player.play(result.audioBlob);
        }
      } catch (err) {
        setErrors((prev) => [
          ...prev,
          err instanceof Error ? err.message : "Erreur LLM/TTS",
        ]);
      }

      // Return to idle
      setState("idle");
      stateRef.current = "idle";
      audioRoutingRef.current = "passive";
      passiveSTT.resume();
    },
    [passiveSTT, player]
  );

  const commandSTT = useCommandSTT(handleCommandComplete);

  const handleWakeWord = useCallback(() => {
    console.log("[AURA] handleWakeWord triggered, current state:", stateRef.current);
    if (stateRef.current === "speaking") {
      player.stop();
    }

    if (
      stateRef.current === "idle" ||
      stateRef.current === "speaking"
    ) {
      playBeep();
      setState("listening");
      stateRef.current = "listening";

      passiveSTT.pause();
      audioRoutingRef.current = "command";

      console.log("[AURA] Starting command STT, sampleRate:", audio.sampleRate);
      commandSTT.startListening(audio.sampleRate);
    }
  }, [passiveSTT, commandSTT, player, audio.sampleRate]);

  // Route PCM chunks to the correct STT
  const handlePCMChunk = useCallback(
    (samples: Int16Array, sampleRate: number) => {
      if (audioRoutingRef.current === "command") {
        commandSTT.sendAudioChunk(samples, sampleRate);
      } else {
        passiveSTT.sendAudioChunk(samples, sampleRate);
      }
    },
    [commandSTT, passiveSTT]
  );

  // Register PCM callback
  useEffect(() => {
    audio.onPCMChunk(handlePCMChunk);
  }, [audio, handlePCMChunk]);

  // Register wake word callback
  useEffect(() => {
    porcupine.onKeywordDetected(handleWakeWord);
  }, [porcupine, handleWakeWord]);

  // Update passive entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPassiveEntries(contextBuffer.getEntries());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Collect errors
  useEffect(() => {
    const errs: string[] = [];
    if (audio.error) errs.push(audio.error);
    if (passiveSTT.error) errs.push(passiveSTT.error);
    if (commandSTT.error) errs.push(commandSTT.error);
    if (porcupine.error) errs.push(porcupine.error);
    setErrors(errs);
  }, [audio.error, passiveSTT.error, commandSTT.error, porcupine.error]);

  const initialize = useCallback(async () => {
    setState("initializing");
    stateRef.current = "initializing";

    try {
      // 1. Request mic access — returns values immediately (no React state delay)
      const mic = await audio.requestMicAccess();

      // 2. Start passive STT
      await passiveSTT.start(mic.sampleRate);

      // 3. Start Porcupine wake word
      await porcupine.startListening(mic.stream);

      // Ready
      setState("idle");
      stateRef.current = "idle";
      audioRoutingRef.current = "passive";
    } catch (err) {
      setState("error");
      stateRef.current = "error";
      setErrors((prev) => [
        ...prev,
        err instanceof Error ? err.message : "Erreur initialisation",
      ]);
    }
  }, [audio, passiveSTT, porcupine]);

  return {
    state,
    volume: audio.volume,
    sampleRate: audio.sampleRate,
    passivePartial: passiveSTT.currentPartial,
    commandPartial: commandSTT.partialText,
    commandCommitted: commandSTT.committedText,
    passiveTranscriptCount: passiveSTT.transcriptCount,
    passiveEntries,
    history,
    fallbackMode: porcupine.fallbackMode,
    errors,
    initialize,
    triggerWakeWord: handleWakeWord,
  };
}
