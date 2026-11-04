export const GC_AI_UNAVAILABLE_MESSAGE =
  "GC AI is temporarily unavailable. Please try again shortly.";

const PROVIDER_FAILURE_PATTERN =
  /gemini.*(?:unavailable|not configured|not available)|openrouter.*(?:unavailable|not configured|not available)|gcsharp model (?:is )?not configured|gc_model_(?:url|path|repo_id)|external llm generation is disabled|providers?(?: are)? unavailable|provider_unavailable/i;

export function isGcAiProviderFailure(message: string): boolean {
  return PROVIDER_FAILURE_PATTERN.test(message);
}

export function presentGcAiMessage(message: string): string {
  const videoModelFailure = message.match(
    /^GCSharp video model unavailable:\s*([\s\S]+)$/i,
  );
  if (videoModelFailure) {
    return `GC AI video generation is unavailable. ${videoModelFailure[1].trim()}`;
  }
  return isGcAiProviderFailure(message) ? GC_AI_UNAVAILABLE_MESSAGE : message;
}

export function gcAiErrorMessage(error: unknown, fallback: string): string {
  let message = error instanceof Error ? error.message : String(error || "");
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (typeof data === "object" && data !== null) {
      const responseData = data as { detail?: unknown; message?: unknown };
      const detail = responseData.detail ?? responseData.message;
      if (typeof detail === "string" && detail.trim()) message = detail;
    } else if (typeof data === "string") {
      try {
        const payload = JSON.parse(data);
        const detail = payload?.detail ?? payload?.message;
        if (typeof detail === "string" && detail.trim()) message = detail;
      } catch {
        // Keep the original error message when the response is not JSON.
      }
    }
  }
  const jsonStart = message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(message.slice(jsonStart));
      const detail = payload?.detail ?? payload?.message;
      if (typeof detail === "string" && detail.trim()) message = detail;
    } catch {
      // Keep the original message when it contains non-JSON response text.
    }
  }
  return message ? presentGcAiMessage(message) : fallback;
}
