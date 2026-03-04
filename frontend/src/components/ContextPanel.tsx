"use client";

import type { ContextEntry } from "@/lib/contextBuffer";

interface ContextPanelProps {
  entries: ContextEntry[];
  currentPartial: string;
}

export function ContextPanel({ entries, currentPartial }: ContextPanelProps) {
  if (entries.length === 0 && !currentPartial) return null;

  return (
    <div className="w-full max-w-lg rounded-lg bg-[var(--surface)] p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Contexte ambiant ({entries.length} segments)
      </h3>
      <div className="max-h-40 overflow-y-auto">
        {entries.map((entry, i) => (
          <div key={i} className="mb-1 flex gap-2 text-sm">
            <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
              {entry.timestamp.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <span className="text-[var(--text-secondary)]">{entry.text}</span>
          </div>
        ))}
        {currentPartial && (
          <div className="mb-1 flex gap-2 text-sm">
            <span className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
              ...
            </span>
            <span className="italic text-[var(--text-muted)]">
              {currentPartial}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
