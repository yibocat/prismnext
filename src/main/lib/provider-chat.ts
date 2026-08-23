import { piProviderBaseUrl } from "../../shared/providers/pi-catalog";

const ANTHROPIC_STYLE_MODELS = new Set([
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
]);

function usesAnthropicMessagesApi(provider: string, model: string): boolean {
  if (provider === "anthropic" || provider === "minimax" || provider === "minimax-cn") return true;
  if ((provider === "opencode-go" || provider === "opencode") && ANTHROPIC_STYLE_MODELS.has(model)) {
    return true;
  }
  return false;
}

function anthropicMessagesUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (/\/v\d+$/i.test(root)) return `${root}/messages`;
  return `${root}/v1/messages`;
}

function openAiCompletionsUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (/\/v\d+$/i.test(root) || /\/compatible-mode\/v1$/i.test(root)) {
    return `${root}/chat/completions`;
  }
  return `${root}/v1/chat/completions`;
}

const PROVIDER_ENDPOINTS: Record<string, { base: string; header: string; prefix: string }> = {
  anthropic: { base: "https://api.anthropic.com", header: "x-api-key", prefix: "" },
  openai: { base: "https://api.openai.com", header: "Authorization", prefix: "Bearer " },
  deepseek: { base: "https://api.deepseek.com", header: "Authorization", prefix: "Bearer " },
  openrouter: { base: "https://openrouter.ai/api", header: "Authorization", prefix: "Bearer " },
  groq: { base: "https://api.groq.com/openai", header: "Authorization", prefix: "Bearer " },
  mistral: { base: "https://api.mistral.ai", header: "Authorization", prefix: "Bearer " },
};

export async function completeChatJson(opts: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const ep = PROVIDER_ENDPOINTS[opts.provider];
  const base = (opts.baseUrl || ep?.base || "").replace(/\/+$/, "");
  if (!base) throw new Error(`Unknown provider: ${opts.provider}`);

  const url = `${base}/v1/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ep?.header) {
    headers[ep.header] = ep.prefix + opts.apiKey;
  } else {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Chat API ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error("Empty chat completion response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeChatText(opts: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const base = (opts.baseUrl || piProviderBaseUrl(opts.provider) || "").replace(/\/+$/, "");
  if (!base) throw new Error(`Unknown provider: ${opts.provider}`);
  const maxTokens = opts.maxTokens ?? 64;
  const timeoutMs = opts.timeoutMs ?? 15_000;

  if (opts.provider === "google") {
    return completeGoogleText({ ...opts, base, maxTokens, timeoutMs });
  }
  if (usesAnthropicMessagesApi(opts.provider, opts.model)) {
    return completeAnthropicText({ ...opts, base, maxTokens, timeoutMs });
  }
  return completeOpenAiText({ ...opts, base, maxTokens, timeoutMs });
}

async function completeOpenAiText(opts: {
  provider: string;
  model: string;
  apiKey: string;
  base: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const url = openAiCompletionsUrl(opts.base);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
  };
  const ep = PROVIDER_ENDPOINTS[opts.provider];
  if (ep?.header === "x-api-key") {
    delete headers.Authorization;
    headers["x-api-key"] = opts.apiKey;
  }
  const data = await fetchJson(url, {
    headers,
    body: {
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      temperature: 0.2,
      max_tokens: opts.maxTokens,
    },
    timeoutMs: opts.timeoutMs,
  });
  const content = (data as { choices?: Array<{ message?: { content?: string } }> })
    .choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("Empty chat completion response");
  return content.trim();
}

async function completeAnthropicText(opts: {
  provider: string;
  model: string;
  apiKey: string;
  base: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const url = anthropicMessagesUrl(opts.base);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "x-api-key": opts.apiKey,
  };
  if (opts.provider === "opencode-go" || opts.provider === "opencode") {
    headers.Authorization = `Bearer ${opts.apiKey}`;
  }
  const data = await fetchJson(url, {
    headers,
    body: {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: 0.2,
      messages: [{ role: "user", content: opts.prompt }],
    },
    timeoutMs: opts.timeoutMs,
  });
  const text = ((data as { content?: Array<{ type?: string; text?: string }> }).content ?? [])
    .map((part) => (part?.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) throw new Error("Empty chat completion response");
  return text;
}

async function completeGoogleText(opts: {
  model: string;
  apiKey: string;
  base: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const root = opts.base.replace(/\/+$/, "");
  const url = `${root}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const data = await fetchJson(url, {
    headers: { "Content-Type": "application/json" },
    body: {
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: opts.maxTokens },
    },
    timeoutMs: opts.timeoutMs,
  });
  const text = ((data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) throw new Error("Empty chat completion response");
  return text;
}

async function fetchJson(
  url: string,
  opts: { headers: Record<string, string>; body: unknown; timeoutMs: number },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: opts.headers,
      signal: controller.signal,
      body: JSON.stringify(opts.body),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Chat API ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
