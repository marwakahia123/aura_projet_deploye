"use client";

import { useAuraSession } from "@/hooks/useAuraSession";
import { AuraOrb } from "@/components/AuraOrb";
import { StatusBar } from "@/components/StatusBar";
import { VolumeIndicator } from "@/components/VolumeIndicator";
import { LiveTranscript } from "@/components/LiveTranscript";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ContextPanel } from "@/components/ContextPanel";

export default function Home() {
  const session = useAuraSession();

  // Before initialization
  if (session.state === "initializing" && session.volume === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="text-3xl font-bold tracking-wider">AURA POC</h1>
        <p className="text-sm italic text-[var(--text-secondary)]">
          Assistant Vocal IA
        </p>
        <button
          onClick={session.initialize}
          className="rounded-full bg-[var(--blue-idle)] px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Démarrer AURA
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-12">
      {/* Title */}
      <h1 className="text-2xl font-bold tracking-wider">AURA</h1>

      {/* Orb */}
      <AuraOrb state={session.state} volume={session.volume} />

      {/* Status */}
      <StatusBar state={session.state} fallbackMode={session.fallbackMode} />

      {/* Volume indicator */}
      <VolumeIndicator volume={session.volume} />

      {/* Push-to-talk button */}
      {session.fallbackMode === "push-to-talk" && session.state === "idle" && (
        <button
          onClick={session.triggerWakeWord}
          className="rounded-full bg-[var(--green-listening)] px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Parler
        </button>
      )}

      {/* Live transcript (command mode) */}
      <LiveTranscript
        partialText={session.commandPartial}
        committedText={session.commandCommitted}
        isActive={session.state === "listening"}
      />

      {/* Errors */}
      {session.errors.length > 0 && (
        <div className="w-full max-w-lg">
          {session.errors.map((err, i) => (
            <p key={i} className="text-xs text-[var(--red-error)]">
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Conversation history */}
      <TranscriptPanel history={session.history} />

      {/* Passive context (debug) */}
      <ContextPanel
        entries={session.passiveEntries}
        currentPartial={session.passivePartial}
      />
    </div>
  );
}
