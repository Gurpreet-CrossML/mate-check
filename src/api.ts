import { fetch as expoFetch } from "expo/fetch";
import { API_BASE_URL } from "./config";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatStreamHandlers = {
  onDelta?: (delta: string, full: string) => void;
  onDone?: (full: string) => void;
};

// Streams the assistant reply token-by-token over NDJSON. Resolves with the full text.
export async function streamChatReply(
  message: string,
  history: ChatMessage[] = [],
  handlers: ChatStreamHandlers = {}
): Promise<string> {
  const res = await expoFetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    let errMsg = `chat failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }

  if (!res.body) {
    const text = await res.text();
    return parseNdjsonString(text, handlers);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      full = applyEvent(line, full, handlers);
    }
  }

  if (buffer.trim()) {
    full = applyEvent(buffer.trim(), full, handlers);
  }

  handlers.onDone?.(full);
  return full;
}

function applyEvent(line: string, full: string, handlers: ChatStreamHandlers): string {
  let ev: { type?: string; content?: string; error?: string };
  try {
    ev = JSON.parse(line);
  } catch {
    return full;
  }
  if (ev.type === "delta" && typeof ev.content === "string") {
    const next = full + ev.content;
    handlers.onDelta?.(ev.content, next);
    return next;
  }
  if (ev.type === "error") {
    throw new Error(ev.error ?? "stream error");
  }
  return full;
}

function parseNdjsonString(text: string, handlers: ChatStreamHandlers): string {
  let full = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    full = applyEvent(line, full, handlers);
  }
  handlers.onDone?.(full);
  return full;
}

export type TtsClip = {
  audio: string; // base64 WAV
  mime: string;
  sampleRate: number;
  durationMs: number;
  envelope: number[]; // 0..1 amplitude per envelopeWindowMs slice
  envelopeWindowMs: number;
};

export async function fetchTtsClip(text: string): Promise<TtsClip> {
  const res = await fetch(`${API_BASE_URL}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `tts failed (${res.status})`);
  return data as TtsClip;
}
