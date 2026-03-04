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
    <div className="w-full max-w-lg rounded-lg bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Historique
      </h3>
      <div className="max-h-60 space-y-3 overflow-y-auto">
        {history.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div className="flex gap-2 text-sm">
              <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
                {entry.timestamp.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-[var(--green-listening)]">
                {entry.command}
              </span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
                {"    "}
              </span>
              <span className="text-[var(--purple-speaking)]">
                {entry.response}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
