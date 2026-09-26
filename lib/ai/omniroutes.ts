// ============================================================
//  OmniRoute client — local OpenAI-compatible AI gateway.
//
//  OmniRoute (https://github.com/diegosouzapw/OmniRoute) serves an
//  OpenAI-compatible /v1 endpoint on the local machine, defaulting to
//  http://localhost:20128/v1 (keyless auto-route on a fresh install).
//  Config via env (see .env.example):
//    OMNIROUTES_BASE_URL  default http://localhost:20128/v1
//    OMNIROUTES_API_KEY   optional bearer key
//    OMNIROUTES_MODEL     default "auto" (gateway picks the best provider)
// ============================================================

export class OmniRouteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OmniRouteError";
  }
}

export function omniRouteConfig() {
  const baseUrl = (process.env.OMNIROUTES_BASE_URL ?? "http://localhost:20128/v1").replace(/\/+$/, "");
  const apiKey = process.env.OMNIROUTES_API_KEY ?? "";
  const model = process.env.OMNIROUTES_MODEL ?? "auto";
  return { baseUrl, apiKey, model };
}

export async function omniChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const { baseUrl, apiKey, model } = omniRouteConfig();
  const timeoutMs = opts.timeoutMs ?? 150_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 5000,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new OmniRouteError(`AI gateway responded with ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new OmniRouteError("AI gateway returned an empty response.");
    }
    return content;
  } catch (err) {
    if (err instanceof OmniRouteError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OmniRouteError("AI generation timed out. Try fewer questions at once.");
    }
    const e = err as Error;
    throw new OmniRouteError(`Could not reach the AI gateway at ${baseUrl}. ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}