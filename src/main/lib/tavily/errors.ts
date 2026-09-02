export type TavilyErrorCode =
  | "missing_tavily_api_key"
  | "tavily_unauthorized"
  | "tavily_rate_limit"
  | "tavily_quota"
  | "invalid_url"
  | "tavily_request_failed";

export type WebToolError = {
  ok: false;
  error: TavilyErrorCode;
  message: string;
};

const MISSING_KEY_MESSAGE =
  "Tavily API key is not set. Add it in Settings → Literature → Web search.";

export function missingTavilyApiKeyError(): WebToolError {
  return {
    ok: false,
    error: "missing_tavily_api_key",
    message: MISSING_KEY_MESSAGE,
  };
}

function statusFromUnknown(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const rec = err as Record<string, unknown>;
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.statusCode === "number") return rec.statusCode;
  const response = rec.response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function messageFromUnknown(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message.trim();
  }
  return String(err);
}

export function mapTavilyError(err: unknown): WebToolError {
  const status = statusFromUnknown(err);
  const message = messageFromUnknown(err);

  if (status === 401 || /unauthorized|invalid api key/i.test(message)) {
    return {
      ok: false,
      error: "tavily_unauthorized",
      message: "Tavily rejected the API key. Check Settings → Literature → Web search.",
    };
  }
  if (status === 429 || /rate limit|too many requests/i.test(message)) {
    return {
      ok: false,
      error: "tavily_rate_limit",
      message: "Tavily rate limit exceeded. Wait and try again.",
    };
  }
  if (status === 432 || status === 433 || /plan'?s set usage|pay-as-you-go limit|quota/i.test(message)) {
    return {
      ok: false,
      error: "tavily_quota",
      message: "Tavily plan or credit limit exceeded. Upgrade at tavily.com or wait for the monthly reset.",
    };
  }
  return {
    ok: false,
    error: "tavily_request_failed",
    message: message || "Tavily request failed.",
  };
}
