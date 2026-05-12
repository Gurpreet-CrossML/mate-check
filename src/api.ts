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

export async function fetchClipVideoUrl(text: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `clip failed (${res.status})`);
  if (!data.videoUrl) throw new Error("No video URL returned");
  return data.videoUrl as string;
}
