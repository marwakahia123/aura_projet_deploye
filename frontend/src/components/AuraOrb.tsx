"use client";

import type { AppState } from "./StatusBar";
import { COLORS } from "@/lib/constants";

interface AuraOrbProps {
  state: AppState;
  volume: number;
}

const STATE_STYLES: Record<
  AppState,
  { color: string; animation: string; shadow: string }
> = {
  initializing: {
    color: "#6b7280",
    animation: "animate-pulse",
    shadow: "0 0 30px #6b728040",
  },
  idle: {
    color: COLORS.idle,
    animation: "animate-breathe",
    shadow: `0 0 60px ${COLORS.idle}40`,
  },
  listening: {
    color: COLORS.listening,
    animation: "animate-pulse-fast",
    shadow: `0 0 80px ${COLORS.listening}60`,
  },
  thinking: {
    color: COLORS.thinking,
    animation: "animate-spin-slow",
    shadow: `0 0 60px ${COLORS.thinking}50`,
  },
  speaking: {
    color: COLORS.speaking,
    animation: "animate-pulse",
    shadow: `0 0 60px ${COLORS.speaking}50`,
  },
  error: {
    color: COLORS.error,
    animation: "",
    shadow: `0 0 40px ${COLORS.error}40`,
  },
};

export function AuraOrb({ state, volume }: AuraOrbProps) {
  const style = STATE_STYLES[state];
  const scale = state === "listening" ? 1 + (volume / 100) * 0.15 : 1;

  return (
    <>
      <style jsx global>{`
        @keyframes breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
        }
        @keyframes pulse-fast {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-breathe {
          animation: breathe 4s ease-in-out infinite;
        }
        .animate-pulse-fast {
          animation: pulse-fast 1s ease-in-out infinite;
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
      <div className="relative">
        {/* Outer ring for thinking state */}
        {state === "thinking" && (
          <div
            className="absolute inset-[-8px] rounded-full border-2 border-transparent animate-spin-slow"
            style={{
              borderTopColor: style.color,
              borderRightColor: `${style.color}40`,
            }}
          />
        )}

        {/* Main orb */}
        <div
          className={`h-[180px] w-[180px] rounded-full transition-all duration-300 md:h-[180px] md:w-[180px] ${style.animation}`}
          style={{
            background: `radial-gradient(circle at 35% 35%, ${style.color}cc, ${style.color}80, ${style.color}40)`,
            boxShadow: style.shadow,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </>
  );
}
