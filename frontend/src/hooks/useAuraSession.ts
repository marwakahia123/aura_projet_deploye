"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/components/StatusBar";
import type { ConversationEntry } from "@/components/TranscriptPanel";
import { useAudioCapture } from "./useAudioCapture";
import { usePassiveSTT } from "./usePassiveSTT";
import { useCommandSTT } from "./useCommandSTT";
import { useOpenWakeWord } from "./useOpenWakeWord";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAuthContext } from "@/context/AuthContext";
import { sendChat } from "@/lib/api";
import { contextBuffer } from "@/lib/contextBuffer";
import { contextPersistence } from "@/lib/contextPersistence";
import {
  CONVERSATION_WINDOW_MS,
  BARGEIN_VOLUME_THRESHOLD,
  BARGEIN_VOLUME_THRESHOLD_SPEAKING,
  BARGEIN_CONSECUTIVE_FRAMES,
} from "@/lib/constants";

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
  const conversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const bargeInFrameCountRef = useRef(0);

  const { session: authSession } = useAuthContext();
  const audio = useAudioCapture();
  const passiveSTT = usePassiveSTT();
  const player = useAudioPlayer();
  const wakeword = useOpenWakeWord();

  // Clear conversation timer helper
  const clearConversationTimer = useCallback(() => {
    if (conversationTimerRef.current) {
      clearTimeout(conversationTimerRef.current);
      conversationTimerRef.current = null;
    }
  }, []);

  // Start the conversation window timer (after speaking ends)
  const startConversationWindow = useCallback(() => {
    clearConversationTimer();
    setState("conversing");
    stateRef.current = "conversing";
    bargeInFrameCountRef.current = 0;
    // passiveSTT stays paused — we don't want ambient noise during conversation

    conversationTimerRef.current = setTimeout(() => {
      if (stateRef.current === "conversing") {
        // Window expired — return to idle and resume passive listening
        console.log("[AURA] Conversation window expired, returning to idle");
        setState("idle");
        stateRef.current = "idle";
        audioRoutingRef.current = "passive";
        passiveSTT.resume();
      }
    }, CONVERSATION_WINDOW_MS);
  }, [passiveSTT, clearConversationTimer]);

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
        const accessToken = authSession?.access_token;
        console.log("[AURA] Sending to API:", {
          command,
          contextCount: context.length,
          hasToken: !!accessToken,
        });
        const result = await sendChat(command, context, accessToken);
        console.log("[AURA] API response:", {
          text: result.text?.substring(0, 100),
          hasAudio: !!result.audioBlob,
        });

        // Add to history
        const entry: ConversationEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          command,
          response: result.text,
        };
        setHistory((prev) => [...prev, entry]);

        // Add Q&A to context buffer for conversational continuity
        contextBuffer.add(`[Commande utilisateur]: ${command}`);
        contextBuffer.add(`[Réponse Aura]: ${result.text}`);

        // Play TTS if available
        if (result.audioBlob && result.audioBlob.size > 0) {
          setState("speaking");
          stateRef.current = "speaking";
          await player.play(result.audioBlob);
          // play() resolves when audio ends OR when stop() is called (barge-in)
        }
      } catch (err) {
        setErrors((prev) => [
          ...prev,
          err instanceof Error ? err.message : "Erreur LLM/TTS",
        ]);
      }

      // Check if we were interrupted by barge-in (state would already be "listening")
      if (
        stateRef.current === "speaking" ||
        stateRef.current === "thinking"
      ) {
        // Not interrupted — enter conversation mode
        startConversationWindow();
      } else {
        // We were interrupted (barge-in), state is already "listening"
        // Do nothing — the barge-in handler already took over
        console.log(
          "[AURA] Barge-in detected, skipping conversing transition"
        );
      }
    },
    [passiveSTT, player, startConversationWindow]
  );

  const commandSTT = useCommandSTT(handleCommandComplete);

  // Enter listening from conversing or speaking state (barge-in / follow-up)
  const enterListeningFromConversation = useCallback(() => {
    clearConversationTimer();

    // If speaking, stop TTS immediately
    if (stateRef.current === "speaking") {
      console.log("[AURA] Barge-in: stopping TTS");
      player.stop();
    }

    console.log("[AURA] Entering listening from conversation/barge-in");
    playBeep();
    setState("listening");
    stateRef.current = "listening";
    audioRoutingRef.current = "command";
    bargeInFrameCountRef.current = 0;
    commandSTT.startListening(audio.sampleRate);
  }, [player, commandSTT, audio.sampleRate, clearConversationTimer]);

  const handleWakeWord = useCallback(() => {
    console.log(
      "[AURA] handleWakeWord triggered, current state:",
      stateRef.current
    );
    if (stateRef.current === "speaking") {
      player.stop();
    }

    if (
      stateRef.current === "idle" ||
      stateRef.current === "speaking" ||
      stateRef.current === "conversing"
    ) {
      clearConversationTimer();
      playBeep();
      setState("listening");
      stateRef.current = "listening";

      passiveSTT.pause();
      audioRoutingRef.current = "command";

      console.log(
        "[AURA] Starting command STT, sampleRate:",
        audio.sampleRate
      );
      commandSTT.startListening(audio.sampleRate);
    }
  }, [
    passiveSTT,
    commandSTT,
    player,
    audio.sampleRate,
    clearConversationTimer,
  ]);

  // Route PCM chunks to the correct STT + barge-in / conversation VAD
  const handlePCMChunk = useCallback(
    (samples: Int16Array, sampleRate: number) => {
      const currentState = stateRef.current;

      // --- Barge-in / Conversation VAD ---
      if (currentState === "speaking" || currentState === "conversing") {
        // Compute RMS volume from PCM samples
        let sumSq = 0;
        for (let i = 0; i < samples.length; i++) {
          sumSq += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sumSq / samples.length);
        const volumePercent = Math.min(
          100,
          Math.round((rms / 32768) * 100 * 3)
        );

        const threshold =
          currentState === "speaking"
            ? BARGEIN_VOLUME_THRESHOLD_SPEAKING
            : BARGEIN_VOLUME_THRESHOLD;

        if (volumePercent > threshold) {
          bargeInFrameCountRef.current++;
          if (bargeInFrameCountRef.current >= BARGEIN_CONSECUTIVE_FRAMES) {
            enterListeningFromConversation();
            return; // Don't route this chunk yet
          }
        } else {
          bargeInFrameCountRef.current = 0;
        }
      }

      // --- Normal routing ---
      if (audioRoutingRef.current === "command") {
        commandSTT.sendAudioChunk(samples, sampleRate);
      } else {
        passiveSTT.sendAudioChunk(samples, sampleRate);
      }
    },
    [commandSTT, passiveSTT, enterListeningFromConversation]
  );

  // Register PCM callback
  useEffect(() => {
    audio.onPCMChunk(handlePCMChunk);
  }, [audio, handlePCMChunk]);

  // Register PCM 16kHz callback for wake word
  useEffect(() => {
    audio.onPCM16kChunk((samples: Int16Array) => {
      wakeword.sendAudio(samples);
    });
  }, [audio, wakeword]);

  // Register wake word callback
  useEffect(() => {
    wakeword.onKeywordDetected(handleWakeWord);
  }, [wakeword, handleWakeWord]);

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
    if (wakeword.error) errs.push(wakeword.error);
    setErrors(errs);
  }, [audio.error, passiveSTT.error, commandSTT.error, wakeword.error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (conversationTimerRef.current) {
        clearTimeout(conversationTimerRef.current);
      }
      contextPersistence.endSession();
    };
  }, []);

  const initialize = useCallback(async () => {
    setState("initializing");
    stateRef.current = "initializing";
    clearConversationTimer();

    try {
      // 1. Request mic access — returns values immediately (no React state delay)
      const mic = await audio.requestMicAccess();

      // 2. Start context persistence session
      await contextPersistence.startSession();

      // 3. Start passive STT
      await passiveSTT.start(mic.sampleRate);

      // 4. Start openWakeWord
      await wakeword.startListening(mic.stream);

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
  }, [audio, passiveSTT, wakeword, clearConversationTimer]);

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
    fallbackMode: wakeword.fallbackMode,
    errors,
    initialize,
    triggerWakeWord: handleWakeWord,
  };
}
