"use client";

import { useState } from "react";
import type { ContextEntry } from "@/lib/contextBuffer";

interface ContextPanelProps {
  entries: ContextEntry[];
  currentPartial: string;
}

export function ContextPanel({ entries, currentPartial }: ContextPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (entries.length === 0 && !currentPartial) return null;

  return (
    <div className="w-full max-w-lg">
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:opacity-80"
        style={{
          background: expanded ? "rgba(255,255,255,0.03)" : "transparent",
          border: expanded
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid transparent",
          borderRadius: expanded ? "16px 16px 0 0" : "16px",
          backdropFilter: expanded ? "blur(20px)" : "none",
          WebkitBackdropFilter: expanded ? "blur(20px)" : "none",
        }}
      >
        {/* Chevron */}
        <span
          className="inline-block text-[10px] transition-transform duration-200"
          style={{
            color: "rgba(255,255,255,0.35)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          &#9654;
        </span>

        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Contexte ambiant
        </span>

        <span
          className="ml-auto font-mono text-[10px]"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          {entries.length} segment{entries.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-2"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderTop: "none",
            borderRadius: "0 0 16px 16px",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            className="max-h-40 overflow-y-auto pr-1"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.08) transparent",
            }}
          >
            {entries.map((entry, i) => (
              <div
                key={i}
                className="flex items-baseline gap-2 py-[3px]"
              >
                <span
                  className="shrink-0 font-mono text-[10px]"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {entry.timestamp.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className="text-xs leading-snug"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {entry.text}
                </span>
              </div>
            ))}

            {currentPartial && (
              <div className="flex items-baseline gap-2 py-[3px]">
                <span
                  className="shrink-0 font-mono text-[10px]"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  ...
                </span>
                <span
                  className="text-xs italic leading-snug"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {currentPartial}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
