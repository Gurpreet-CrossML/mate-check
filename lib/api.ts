const BASE_URL = 'https://mate-check-backend.vercel.app';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChat(
  message: string,
  history: ChatHistoryItem[] = []
): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw new Error(`Chat API failed: ${response.status}`);
  }

  // Backend streams NDJSON: {"type":"delta","content":"..."} ... {"type":"done"}
  const raw = await response.text();
  let reply = '';
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === 'delta' && typeof parsed.content === 'string') {
        reply += parsed.content;
      }
    } catch {
      // Ignore malformed lines
    }
  }
  return reply.trim();
}

export interface TtsClip {
  audio: string; // base64-encoded WAV
  mime: string;
  sampleRate: number;
  durationMs: number;
  envelope: number[]; // 0..1 amplitude buckets
  envelopeWindowMs: number;
}

export async function fetchTtsClip(text: string): Promise<TtsClip> {
  const res = await fetch(`${BASE_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    const snippet = raw.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`tts returned non-JSON (status ${res.status}): ${snippet || '<empty>'}`);
  }
  if (!res.ok) {
    throw new Error(parsed?.error ?? `tts failed (${res.status})`);
  }
  return parsed as TtsClip;
}
