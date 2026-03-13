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
  context: TranscriptionSegment[],
  accessToken?: string
): Promise<ChatResult> {
  // --- Step 1: Get text from agent ---
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      command,
      context,
      user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
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

// Fetch summaries
export async function fetchSummaries(accessToken: string, limit = 20, offset = 0) {
  const res = await fetch(`${BACKEND_URL}/api/summaries?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch summaries");
  return res.json();
}

// Fetch contacts
export async function fetchContacts(accessToken: string, search = "") {
  const url = search
    ? `${BACKEND_URL}/api/contacts?search=${encodeURIComponent(search)}`
    : `${BACKEND_URL}/api/contacts`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  return res.json();
}

// Create contact
export async function createContact(accessToken: string, contact: {
  name: string; email: string;
  phone: string; company: string; notes: string;
}) {
  const res = await fetch(`${BACKEND_URL}/api/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error("Failed to create contact");
  return res.json();
}

// Delete contact
export async function deleteContact(accessToken: string, contactId: string) {
  const res = await fetch(`${BACKEND_URL}/api/contacts/${contactId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to delete contact");
  return res.json();
}

// Fetch activity
export async function fetchActivity(accessToken: string, limit = 50) {
  const res = await fetch(`${BACKEND_URL}/api/activity?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

// Fetch discussions
export async function fetchDiscussions(accessToken: string, search = "", limit = 20) {
  const url = `${BACKEND_URL}/api/discussions?limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch discussions");
  return res.json();
}
