import { getToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export interface SSEHandle {
  close: () => void;
}

export function createSSEStream(
  path: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (msg: string) => void,
): SSEHandle {
  const token = getToken() ?? "";
  const url = `${BASE_URL}${path}?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    onChunk(e.data);
  };

  es.addEventListener("done", () => {
    es.close();
    onDone();
  });

  es.addEventListener("error", (e) => {
    es.close();
    onError?.((e as MessageEvent).data ?? "SSE error");
  });

  return { close: () => es.close() };
}

/** POST then open SSE — used for wizard message and chat send. */
export async function postAndStream(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (msg: string) => void,
): Promise<SSEHandle> {
  const token = getToken() ?? "";

  // We can't POST via EventSource. Use fetch with stream reading instead.
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    onError?.(err.error ?? "Request failed");
    return { close: () => {} };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;

  const pump = async () => {
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          onChunk(line.slice(6));
        } else if (line.startsWith("event: done")) {
          onDone();
          return;
        } else if (line.startsWith("event: error")) {
          onError?.(buffer);
          return;
        }
      }
    }
    onDone();
  };

  pump().catch((e) => onError?.(String(e)));

  return {
    close: () => {
      closed = true;
      reader.cancel().catch(() => {});
    },
  };
}
