import { BACKEND_URL } from "./constants";

export interface TranscriptionSegment {
  text: string;
  timestamp: string; // ISO string
  is_partial: boolean;
}

export async function fetchSttToken(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/stt-token`);
  if (!res.ok) throw new Error(`STT token error: ${res.status}`);
  const data = await res.json();
  return data.token;
}

export interface ChatResult {
  text: string;
  audioBlob: Blob | null;
}

/**
 * Step 1: Send command + context to agent → get text response.
 * Step 2: Send text to TTS → get audio blob.
 * If TTS fails, we still have the text — no data is lost.
 */
export async function sendChat(
  command: string,
  context: TranscriptionSegment[]
): Promise<ChatResult> {
  // --- Step 1: Get text from agent ---
  const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, context }),
  });

  if (!chatRes.ok) {
    const detail = await chatRes.text().catch(() => "");
    console.error("[API] Chat error:", chatRes.status, detail);
    throw new Error(`Agent error: ${chatRes.status}`);
  }

  const { text } = await chatRes.json();

  // --- Step 2: Get audio from TTS (non-blocking — text is already saved) ---
  let audioBlob: Blob | null = null;
  try {
    const ttsRes = await fetch(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (ttsRes.ok) {
      audioBlob = await ttsRes.blob();
    } else {
      console.warn("[API] TTS failed:", ttsRes.status);
    }
  } catch (e) {
    console.warn("[API] TTS error, continuing without audio:", e);
  }

  return { text, audioBlob };
}
