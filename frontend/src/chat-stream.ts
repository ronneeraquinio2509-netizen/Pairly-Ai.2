import { fetch as expoFetch } from "expo/fetch";

import { ApiError, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/**
 * Streams Pairly's reply token-by-token over SSE.
 * `onDelta` fires for every chunk; resolves once the stream is done.
 */
export async function streamChat(
  message: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const res = await expoFetch(`${BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!res.ok) {
    let detail = "Pairly could not answer right now.";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming support — fall back to the whole body at once.
    const text = await res.text();
    parseChunk(text, onDelta);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) parseChunk(part, onDelta);
  }
  if (buffer.trim()) parseChunk(buffer, onDelta);
}

function parseChunk(raw: string, onDelta: (chunk: string) => void) {
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const data = JSON.parse(payload);
      if (typeof data.delta === "string") onDelta(data.delta);
      if (typeof data.error === "string") throw new ApiError(503, data.error);
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
  }
}
