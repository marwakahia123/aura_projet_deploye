"use client";

interface VolumeIndicatorProps {
  volume: number; // 0-100
}

export function VolumeIndicator({ volume }: VolumeIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-48 overflow-hidden rounded-full bg-[var(--surface)]">
        <div
          className="h-full rounded-full bg-[var(--green-listening)] transition-all duration-75"
          style={{ width: `${volume}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-[var(--text-muted)]">
        {volume}
      </span>
    </div>
  );
}
