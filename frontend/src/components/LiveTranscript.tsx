"use client";

interface LiveTranscriptProps {
  partialText: string;
  committedText: string;
  isActive: boolean;
}

export function LiveTranscript({
  partialText,
  committedText,
  isActive,
}: LiveTranscriptProps) {
  if (!isActive && !committedText && !partialText) return null;

  return (
    <div className="w-full max-w-lg rounded-lg bg-[var(--surface)] p-4">
      {committedText && (
        <p className="text-lg font-medium text-[var(--foreground)]">
          {committedText}
        </p>
      )}
      {partialText && (
        <p className="text-lg text-[var(--text-secondary)]">
          {partialText}
          {isActive && (
            <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-[var(--foreground)]" />
          )}
        </p>
      )}
      {isActive && !partialText && !committedText && (
        <p className="text-lg text-[var(--text-muted)]">
          En écoute...
          <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-[var(--foreground)]" />
        </p>
      )}
    </div>
  );
}
