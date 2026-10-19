export const GC_AI_UNAVAILABLE_MESSAGE =
  "GC AI is temporarily unavailable. Please try again shortly.";

const PROVIDER_FAILURE_PATTERN =
  /gemini.*(?:unavailable|not configured|not available)|openrouter.*(?:unavailable|not configured|not available)|gcsharp model (?:is )?not configured|gc_model_(?:url|path|repo_id)|external llm generation is disabled|providers?(?: are)? unavailable|provider_unavailable/i;

export function isGcAiProviderFailure(message: string): boolean {
  return PROVIDER_FAILURE_PATTERN.test(message);
}

export function presentGcAiMessage(message: string): string {
  return isGcAiProviderFailure(message) ? GC_AI_UNAVAILABLE_MESSAGE : message;
}

export function gcAiErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message ? presentGcAiMessage(message) : fallback;
}
