"use client";

import { useEffect, useRef } from "react";

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  command: string;
  response: string;
}

interface TranscriptPanelProps {
  history: ConversationEntry[];
}

export function TranscriptPanel({ history }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  if (history.length === 0) return null;

  return (
    <div
      className="w-full max-w-lg p-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "16px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <h3
        className="mb-4 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        Historique
      </h3>

      <div
        className="max-h-64 overflow-y-auto pr-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.08) transparent",
        }}
      >
        {history.map((entry, index) => (
          <div key={entry.id}>
            {/* User command */}
            <div className="flex items-start gap-2.5 py-2">
              <span
                className="mt-[6px] block h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: "#00d68f" }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {entry.command}
                </p>
              </div>
            </div>

            {/* Aura response */}
            <div className="flex items-start gap-2.5 py-2">
              <span
                className="mt-[6px] block h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: "#a78bfa" }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {entry.response}
                </p>
              </div>
            </div>

            {/* Timestamp */}
            <div className="flex justify-end pb-1">
              <span
                className="font-mono text-[10px]"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {entry.timestamp.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Separator */}
            {index < history.length - 1 && (
              <div
                className="my-1"
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.04)",
                }}
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
