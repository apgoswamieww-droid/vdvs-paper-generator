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

/** Human-friendly base origin for UI hints, e.g. "http://localhost:20128". */
export function omniRouteDisplayUrl() {
  return omniRouteConfig().baseUrl.replace(/\/v1\/?$/i, "");
}

// Node's undici fetch wraps low-level socket failures in a
// `TypeError: fetch failed` whose `cause` chain holds the real
// error (with a `code` like ECONNREFUSED). Walk that chain to
// classify the failure so users get an actionable message instead
// of a generic "fetch failed".
function findErrorCode(err: unknown, depth = 0): string | null {
  if (!err || typeof err !== "object" || depth > 4) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  const cause = (err as { cause?: unknown }).cause;
  return cause ? findErrorCode(cause, depth + 1) : null;
}

export function friendlyGatewayError(baseUrl: string, err: unknown): OmniRouteError {
  if (err instanceof OmniRouteError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return new OmniRouteError(
      "The AI gateway accepted the request but generation timed out. Try fewer questions at once."
    );
  }

  const code = findErrorCode(err);
  switch (code) {
    case "ECONNREFUSED":
      return new OmniRouteError(
        `The AI gateway is not running at ${omniRouteDisplayUrl()}. ` +
          "Start the local OmniRoute service (it serves an OpenAI-compatible API on port 20128 by default), " +
          "or point OMNIROUTES_BASE_URL at a reachable gateway, then try again."
      );
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return new OmniRouteError(
        `Could not resolve the AI gateway host configured in OMNIROUTES_BASE_URL (${baseUrl}). ` +
          "Check the URL in .env and try again."
      );
    case "ECONNRESET":
    case "EPIPE":
      return new OmniRouteError(
        `The AI gateway at ${omniRouteDisplayUrl()} dropped the connection. ` +
          "It may be restarting or overloaded — try again in a moment."
      );
    default:
      return new OmniRouteError(
        `Could not reach the AI gateway at ${omniRouteDisplayUrl()}. ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
  }
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
    throw friendlyGatewayError(baseUrl, err);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
//  Gateway health probe
//  Used by GET /api/ai/status to power the admin-facing status
//  indicator. Any HTTP response (even 404/401) proves the service
//  is up; only socket/timeout failures mean it is down.
// ------------------------------------------------------------

export type OmniGatewayStatus = {
  online: boolean;
  baseUrl: string;
  displayUrl: string;
  model: string;
  /** Short human detail, e.g. "ready" or the failure reason. */
  detail: string;
};

export async function omniStatus(timeoutMs = 4_000): Promise<OmniGatewayStatus> {
  const { baseUrl, apiKey, model } = omniRouteConfig();
  const displayUrl = omniRouteDisplayUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
      cache: "no-store",
    });
    // The service is up — but a 401/403 means the key is missing/invalid,
    // which will break every chat call. Say so explicitly.
    const detail =
      res.status === 401 || res.status === 403
        ? `needs an API key (HTTP ${res.status}) — set OMNIROUTES_API_KEY`
        : res.ok
          ? "ready"
          : `reachable (HTTP ${res.status})`;
    return {
      online: true,
      baseUrl,
      displayUrl,
      model,
      detail,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { online: false, baseUrl, displayUrl, model, detail: "timed out" };
    }
    const code = findErrorCode(err);
    const detail =
      code === "ECONNREFUSED"
        ? "connection refused — is the service running?"
        : code
          ? `unreachable (${code})`
          : "unreachable";
    return { online: false, baseUrl, displayUrl, model, detail };
  } finally {
    clearTimeout(timer);
  }
}
