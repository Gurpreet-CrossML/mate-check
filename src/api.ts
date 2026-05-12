import { API_BASE_URL } from "./config";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function fetchChatReply(
  message: string,
  history: ChatMessage[] = []
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `chat failed (${res.status})`);
  return data.reply as string;
}

type ClipStatus = {
  id: string;
  status: string;
  videoUrl: string | null;
  error: string | null;
};

async function startClip(text: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `clip create failed (${res.status})`);
  if (!data.id) throw new Error("No clip id returned");
  return data.id as string;
}

async function getClipStatus(id: string): Promise<ClipStatus> {
  const res = await fetch(`${API_BASE_URL}/api/clip/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `clip status failed (${res.status})`);
  return data as ClipStatus;
}

export type ClipProgress = (info: { attempt: number; status: string }) => void;

export async function fetchClipVideoUrl(
  text: string,
  onProgress?: ClipProgress,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<string> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 180_000;

  const id = await startClip(text);
  const started = Date.now();
  let attempt = 0;

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    const s = await getClipStatus(id);
    onProgress?.({ attempt, status: s.status });
    if (s.status === "done" && s.videoUrl) return s.videoUrl;
    if (s.status === "error" || s.status === "rejected") {
      throw new Error(s.error ?? `clip ${s.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Clip generation timed out (>3 min)");
}
