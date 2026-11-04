export class TriviaError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function fetchJson(url: string, init: RequestInit, timeout: number, service: "trivia" | "ai", fetcher: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new TriviaError(503, "NETWORK_ERROR", service === "trivia"
      ? "We couldn't reach the question library. Please try again."
      : "The AI took too long to respond. Please try the explanation again.");
  }
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = Math.min(300, Math.max(5, Number(response.headers.get("retry-after")) || 10));
      throw new TriviaError(429, "RATE_LIMITED", `A few too many requests. Please wait ${retryAfter} seconds and try again.`, retryAfter);
    }
    if (service === "ai" && (response.status === 401 || response.status === 403)) {
      throw new TriviaError(503, "AI_AUTH_ERROR", "AI explanations couldn't connect. The app owner needs to check the OpenRouter key.");
    }
    if (service === "ai" && response.status === 402) {
      throw new TriviaError(503, "AI_CREDITS_REQUIRED", "AI explanations need OpenRouter credits. You can keep playing without them.");
    }
    if (service === "ai" && [400, 404, 422].includes(response.status)) {
      throw new TriviaError(503, "AI_MODEL_ERROR", "The explanation model isn't available. The app owner needs to check the model setting.");
    }
    throw new TriviaError(502, "UPSTREAM_ERROR", service === "trivia"
      ? "The question library is having trouble right now. Please try again."
      : "The AI service is having trouble right now. Please retry the explanation.");
  }
  try {
    return await response.json();
  } catch {
    throw new TriviaError(502, "INVALID_RESPONSE", "The service sent an unreadable response. Please try again.");
  }
}
