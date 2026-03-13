"use client";

import type { AppState } from "./StatusBar";
import { COLORS } from "@/lib/constants";

interface AuraOrbProps {
  state: AppState;
  volume: number;
}

const STATE_CONFIG: Record<
  AppState,
  { color: string; glowColor: string; coreColor: string }
> = {
  initializing: {
    color: "#6b7280",
    glowColor: "#6b728060",
    coreColor: "#9ca3af",
  },
  idle: {
    color: "#4f8fff",
    glowColor: "#4f8fff50",
    coreColor: "#93bbff",
  },
  listening: {
    color: "#00d68f",
    glowColor: "#00d68f60",
    coreColor: "#5dffc2",
  },
  thinking: {
    color: "#ffb020",
    glowColor: "#ffb02050",
    coreColor: "#ffd580",
  },
  speaking: {
    color: "#a78bfa",
    glowColor: "#a78bfa50",
    coreColor: "#d4c4ff",
  },
  conversing: {
    color: "#22d3ee",
    glowColor: "#22d3ee50",
    coreColor: "#80efff",
  },
  error: {
    color: "#ff4757",
    glowColor: "#ff475740",
    coreColor: "#ff8a94",
  },
};

export function AuraOrb({ state, volume }: AuraOrbProps) {
  const config = STATE_CONFIG[state];
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isError = state === "error";

  // Volume reactivity for listening state
  const volumeFactor = isListening ? volume / 100 : 0;
  const orbScale = isListening ? 1 + volumeFactor * 0.2 : 1;
  const glowExpand = isListening ? 1 + volumeFactor * 0.5 : 1;

  // Animation class per state
  const animClass = isError
    ? ""
    : state === "initializing"
      ? "aura-pulse-subtle"
      : state === "idle"
        ? "aura-breathe"
        : state === "listening"
          ? "aura-pulse-fast"
          : state === "thinking"
            ? "aura-pulse-medium"
            : state === "speaking"
              ? "aura-pulse-medium"
              : state === "conversing"
                ? "aura-pulse-soft"
                : "";

  const ringAnimClass = isThinking ? "aura-spin" : "";
  const haloAnimClass = isError
    ? ""
    : state === "initializing"
      ? "aura-halo-subtle"
      : state === "idle"
        ? "aura-halo-breathe"
        : state === "listening"
          ? "aura-halo-fast"
          : state === "speaking"
            ? "aura-halo-medium"
            : state === "conversing"
              ? "aura-halo-soft"
              : "";

  return (
    <>
      <style jsx global>{`
        /* ─── Breathe (idle, 4s) ─── */
        @keyframes aura-breathe-kf {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .aura-breathe { animation: aura-breathe-kf 4s ease-in-out infinite; }

        /* ─── Fast pulse (listening, 1s) ─── */
        @keyframes aura-pulse-fast-kf {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        .aura-pulse-fast { animation: aura-pulse-fast-kf 1s ease-in-out infinite; }

        /* ─── Medium pulse (speaking, 2.5s) ─── */
        @keyframes aura-pulse-medium-kf {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .aura-pulse-medium { animation: aura-pulse-medium-kf 2.5s ease-in-out infinite; }

        /* ─── Soft pulse (conversing, 2s) ─── */
        @keyframes aura-pulse-soft-kf {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.92; }
        }
        .aura-pulse-soft { animation: aura-pulse-soft-kf 2s ease-in-out infinite; }

        /* ─── Subtle pulse (initializing) ─── */
        @keyframes aura-pulse-subtle-kf {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .aura-pulse-subtle { animation: aura-pulse-subtle-kf 2s ease-in-out infinite; }

        /* ─── Spin (thinking outer ring) ─── */
        @keyframes aura-spin-kf {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .aura-spin { animation: aura-spin-kf 2.5s linear infinite; }

        /* ─── Halo pulse variants ─── */
        @keyframes aura-halo-breathe-kf {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.08); opacity: 0.8; }
        }
        .aura-halo-breathe { animation: aura-halo-breathe-kf 4s ease-in-out infinite; }

        @keyframes aura-halo-fast-kf {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        .aura-halo-fast { animation: aura-halo-fast-kf 1s ease-in-out infinite; }

        @keyframes aura-halo-medium-kf {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.85; }
        }
        .aura-halo-medium { animation: aura-halo-medium-kf 2.5s ease-in-out infinite; }

        @keyframes aura-halo-soft-kf {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.06); opacity: 0.75; }
        }
        .aura-halo-soft { animation: aura-halo-soft-kf 2s ease-in-out infinite; }

        @keyframes aura-halo-subtle-kf {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.04); opacity: 0.5; }
        }
        .aura-halo-subtle { animation: aura-halo-subtle-kf 2s ease-in-out infinite; }

        /* ─── Core shimmer ─── */
        @keyframes aura-core-shimmer {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* ─── Thinking ring secondary spin ─── */
        @keyframes aura-ring-secondary {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }

        /* ─── Particle orbit ─── */
        @keyframes aura-orbit {
          from { transform: rotate(0deg) translateX(110px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(110px) rotate(-360deg); }
        }
        @keyframes aura-orbit-reverse {
          from { transform: rotate(180deg) translateX(105px) rotate(-180deg); }
          to { transform: rotate(-180deg) translateX(105px) rotate(180deg); }
        }
      `}</style>

      <div
        className="relative flex items-center justify-center"
        style={{ width: 280, height: 280 }}
      >
        {/* ════════ Layer 1: Outer ambient glow ════════ */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-500"
          style={{
            background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
            filter: `blur(40px)`,
            transform: `scale(${glowExpand})`,
            opacity: isError ? 0.4 : 0.7,
          }}
        />

        {/* ════════ Layer 2: Diffused color wash ════════ */}
        <div
          className="absolute rounded-full transition-all duration-500"
          style={{
            width: 240,
            height: 240,
            left: 20,
            top: 20,
            background: `radial-gradient(circle at 40% 40%, ${config.color}30 0%, ${config.color}10 50%, transparent 80%)`,
            filter: "blur(20px)",
          }}
        />

        {/* ════════ Layer 3: Pulsing halo ring ════════ */}
        <div
          className={`absolute rounded-full transition-all duration-500 ${haloAnimClass}`}
          style={{
            width: 220,
            height: 220,
            left: 30,
            top: 30,
            border: `1.5px solid ${config.color}40`,
            boxShadow: `
              0 0 20px ${config.color}20,
              inset 0 0 20px ${config.color}10
            `,
          }}
        />

        {/* ════════ Layer 4: Thinking outer ring ════════ */}
        {isThinking && (
          <>
            <div
              className="absolute rounded-full aura-spin"
              style={{
                width: 224,
                height: 224,
                left: 28,
                top: 28,
                border: "2px solid transparent",
                borderTopColor: config.color,
                borderRightColor: `${config.color}60`,
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 228,
                height: 228,
                left: 26,
                top: 26,
                border: "1px solid transparent",
                borderBottomColor: `${config.color}50`,
                borderLeftColor: `${config.color}30`,
                animation: "aura-ring-secondary 4s linear infinite",
              }}
            />
          </>
        )}

        {/* ════════ Layer 5: Orbiting particles ════════ */}
        {(state === "listening" || state === "conversing" || state === "speaking") && (
          <>
            <div
              className="absolute"
              style={{
                width: 6,
                height: 6,
                left: "50%",
                top: "50%",
                marginLeft: -3,
                marginTop: -3,
                borderRadius: "50%",
                background: config.coreColor,
                boxShadow: `0 0 8px ${config.color}`,
                animation: `aura-orbit ${state === "listening" ? "3s" : "5s"} linear infinite`,
                opacity: 0.8,
              }}
            />
            <div
              className="absolute"
              style={{
                width: 4,
                height: 4,
                left: "50%",
                top: "50%",
                marginLeft: -2,
                marginTop: -2,
                borderRadius: "50%",
                background: config.coreColor,
                boxShadow: `0 0 6px ${config.color}`,
                animation: `aura-orbit-reverse ${state === "listening" ? "4s" : "6s"} linear infinite`,
                opacity: 0.6,
              }}
            />
          </>
        )}

        {/* ════════ Layer 6: Main orb sphere ════════ */}
        <div
          className={`absolute rounded-full transition-all duration-500 ${animClass}`}
          style={{
            width: 200,
            height: 200,
            left: 40,
            top: 40,
            background: `
              radial-gradient(
                circle at 38% 35%,
                ${config.coreColor}ee 0%,
                ${config.color}cc 25%,
                ${config.color}90 50%,
                ${config.color}50 75%,
                ${config.color}20 100%
              )
            `,
            boxShadow: `
              0 0 40px ${config.color}40,
              0 0 80px ${config.color}25,
              inset 0 0 40px ${config.color}30,
              inset -8px -8px 30px ${config.color}20
            `,
            transform: `scale(${orbScale})`,
          }}
        />

        {/* ════════ Layer 7: Glass reflection highlight ════════ */}
        <div
          className="absolute rounded-full pointer-events-none transition-all duration-500"
          style={{
            width: 160,
            height: 80,
            left: 52,
            top: 48,
            background: `linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.12) 0%,
              rgba(255, 255, 255, 0.04) 60%,
              transparent 100%
            )`,
            borderRadius: "50%",
            transform: `scale(${orbScale})`,
          }}
        />

        {/* ════════ Layer 8: Inner bright core ════════ */}
        <div
          className="absolute rounded-full pointer-events-none transition-all duration-500"
          style={{
            width: 60,
            height: 60,
            left: 96,
            top: 92,
            background: `radial-gradient(
              circle,
              ${config.coreColor}cc 0%,
              ${config.coreColor}40 40%,
              transparent 70%
            )`,
            filter: "blur(8px)",
            animation: isError ? "none" : "aura-core-shimmer 3s ease-in-out infinite",
            transform: `scale(${orbScale})`,
          }}
        />

        {/* ════════ Layer 9: Specular hot spot ════════ */}
        <div
          className="absolute rounded-full pointer-events-none transition-all duration-500"
          style={{
            width: 24,
            height: 24,
            left: 108,
            top: 86,
            background: `radial-gradient(
              circle,
              rgba(255, 255, 255, 0.35) 0%,
              rgba(255, 255, 255, 0.08) 50%,
              transparent 100%
            )`,
            filter: "blur(4px)",
            transform: `scale(${orbScale})`,
          }}
        />
      </div>
    </>
  );
}
