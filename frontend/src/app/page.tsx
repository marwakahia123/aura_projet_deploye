"use client";

import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { useAuraSession } from "@/hooks/useAuraSession";
import { AuraOrb } from "@/components/AuraOrb";
import { StatusBar } from "@/components/StatusBar";
import { VolumeIndicator } from "@/components/VolumeIndicator";
import { LiveTranscript } from "@/components/LiveTranscript";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ContextPanel } from "@/components/ContextPanel";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthContext();
  const session = useAuraSession();

  // Redirect to login if not authenticated
  if (!authLoading && !user) {
    router.replace("/login");
    return null;
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0a0a0f" }}
      >
        <div
          className="h-20 w-20 animate-pulse rounded-full"
          style={{
            background: "linear-gradient(135deg, #ff9a34, #f5773d, #f35f4f)",
            boxShadow: "0 0 60px rgba(255,154,52,0.3)",
          }}
        />
      </div>
    );
  }

  // Before initialization
  if (session.state === "initializing" && session.volume === 0) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-10"
        style={{ background: "#0a0a0f" }}
      >
        <div className="flex flex-col items-center gap-3">
          <h1
            className="text-5xl font-bold tracking-[0.3em]"
            style={{ color: "#ff8c42" }}
          >
            AURA
          </h1>
          <p
            className="text-sm font-light tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Assistant Vocal IA
          </p>
        </div>

        <div
          className="h-28 w-28 animate-pulse rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 35%, #ffa726, #ff6b35)",
            boxShadow: "0 0 80px rgba(255,154,52,0.25)",
          }}
        />

        <button
          onClick={session.initialize}
          className="rounded-full px-10 py-4 text-sm font-semibold tracking-wider text-white uppercase transition-all duration-300 hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
            boxShadow: "0 0 30px rgba(255,107,53,0.3)",
          }}
        >
          Demarrer AURA
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "#0a0a0f" }}
    >
      {/* Header */}
      <header
        className="flex w-full shrink-0 items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <h1
          className="text-xl font-bold tracking-[0.2em]"
          style={{ color: "#ff8c42" }}
        >
          AURA
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {user?.email}
          </span>
          <button
            onClick={() => router.push("/settings")}
            className="rounded-lg p-2 transition-colors duration-200 hover:bg-white/5"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto">
        {/* Orb section - takes available space but not too much */}
        <div className="flex flex-col items-center gap-4 pt-6 pb-4">
          <AuraOrb state={session.state} volume={session.volume} />
          <StatusBar state={session.state} fallbackMode={session.fallbackMode} />
          <VolumeIndicator volume={session.volume} />
        </div>

        {/* Push-to-talk button */}
        {session.fallbackMode === "push-to-talk" &&
          (session.state === "idle" || session.state === "conversing") && (
          <button
            onClick={session.triggerWakeWord}
            className="mb-4 rounded-full px-8 py-3 text-sm font-medium tracking-wider text-white uppercase transition-all duration-300 hover:scale-105"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(0,214,143,0.4)",
              boxShadow: "0 0 20px rgba(0,214,143,0.15)",
            }}
          >
            Parler
          </button>
        )}

        {/* Live transcript (command mode) */}
        <div className="w-full max-w-lg px-4">
          <LiveTranscript
            partialText={session.commandPartial}
            committedText={session.commandCommitted}
            isActive={session.state === "listening"}
          />
        </div>

        {/* Errors */}
        {session.errors.length > 0 && (
          <div
            className="mx-4 mt-4 w-full max-w-lg rounded-xl p-3"
            style={{
              background: "rgba(255,71,87,0.08)",
              border: "1px solid rgba(255,71,87,0.2)",
            }}
          >
            {session.errors.map((err, i) => (
              <p key={i} className="text-xs" style={{ color: "#ff6b6b" }}>
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Panels section */}
        <div className="mt-4 w-full max-w-lg space-y-3 px-4 pb-8">
          {/* Conversation history */}
          <TranscriptPanel history={session.history} />

          {/* Passive context - always visible when has entries */}
          <ContextPanel
            entries={session.passiveEntries}
            currentPartial={session.passivePartial}
          />
        </div>
      </div>
    </div>
  );
}
