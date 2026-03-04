export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export const PORCUPINE_ACCESS_KEY =
  process.env.NEXT_PUBLIC_PORCUPINE_ACCESS_KEY || "";

// Colors
export const COLORS = {
  idle: "#3b82f6",
  listening: "#22c55e",
  thinking: "#f59e0b",
  speaking: "#8b5cf6",
  error: "#ef4444",
} as const;

// Timeouts
export const COMMAND_TIMEOUT_MS = 30_000;
export const COMMIT_SILENCE_MS = 2_000;
export const TOKEN_REFRESH_MS = 14 * 60 * 1000; // 14 minutes
export const LLM_TIMEOUT_MS = 15_000;

// Context buffer
export const MAX_CONTEXT_SEGMENTS = 50;
export const MAX_CONTEXT_AGE_MS = 30 * 60 * 1000; // 30 minutes
