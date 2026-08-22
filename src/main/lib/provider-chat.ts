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
