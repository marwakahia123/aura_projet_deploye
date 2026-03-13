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
    <div
      className="w-full max-w-lg rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
      }}
    >
      {committedText && (
        <p className="text-lg font-light text-white">
          {committedText}
        </p>
      )}
      {partialText && (
        <p
          className="text-lg font-light"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {partialText}
          {isActive && (
            <span
              className="ml-0.5 inline-block h-5 w-0.5 animate-pulse"
              style={{ background: "#ff9a34" }}
            />
          )}
        </p>
      )}
      {isActive && !partialText && !committedText && (
        <p
          className="text-lg font-light"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          En ecoute...
          <span
            className="ml-0.5 inline-block h-5 w-0.5 animate-pulse"
            style={{ background: "#ff9a34" }}
          />
        </p>
      )}
    </div>
  );
}
