export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Colors
export const COLORS = {
  idle: "#3b82f6",
  listening: "#22c55e",
  thinking: "#f59e0b",
  speaking: "#8b5cf6",
  conversing: "#06b6d4",
  error: "#ef4444",
} as const;

// Conversation continuity
export const CONVERSATION_WINDOW_MS = 8_000; // 8s to reply without wake word
export const BARGEIN_VOLUME_THRESHOLD = 12; // volume threshold during conversing (0-100)
export const BARGEIN_VOLUME_THRESHOLD_SPEAKING = 25; // higher threshold during speaking (TTS echo)
export const BARGEIN_CONSECUTIVE_FRAMES = 3; // consecutive frames above threshold (~300ms)

// Timeouts
export const COMMAND_TIMEOUT_MS = 30_000;
export const COMMIT_SILENCE_MS = 2_000;
export const TOKEN_REFRESH_MS = 14 * 60 * 1000; // 14 minutes
export const LLM_TIMEOUT_MS = 15_000;

// Context buffer
export const MAX_CONTEXT_SEGMENTS = 50;
export const MAX_CONTEXT_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Context persistence
export const PERSIST_BATCH_SIZE = 5;
export const PERSIST_INTERVAL_MS = 10_000; // 10 seconds
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const SUMMARIZE_TRIGGER_SEGMENTS = 30;
export const SUMMARIZE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
