import { createHash } from "node:crypto";
import { createLogger } from "./logger";
import { getSettings } from "./settings";
import { normalizeOpenCodeModelId } from "../../shared/opencode-provider";

const log = createLogger("vision-fallback");

const CACHE_VERSION = "v1";
const CACHE_MAX_ITEMS = 200;
const imageDescriptionCache = new Map<string, string>();

const IMAGE_DESCRIPTION_PROMPT = [
  "You are preparing image context for another text-only coding and research assistant.",
  "Describe the image accurately and concretely.",
  "Include, when present:",
  "- all visible text verbatim",
  "- UI structure, dialogs, errors, warnings, and file names",
  "- charts, axes, legends, equations, tables, and notable values",
  "- what the image is likely for in the user's current task",
  "Be concise but detailed enough that the downstream model can reason without seeing the image.",
].join("\n");

export interface VisionFallbackImageInput {
  name: string;
  mimeType: string;
  data: string;
  uri?: string;
}

export interface VisionFallbackDescription {
  name: string;
  text: string;
  cached: boolean;
}

function getDefaultBaseUrl(providerId: string): string | null {
  switch (providerId) {
    case "openai":
      return "https://api.openai.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "google":
      return "https://generativelanguage.googleapis.com";
    case "anthropic":
      return "https://api.anthropic.com";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "kimi":
      return "https://api.moonshot.ai/v1";
    case "zhipu":
      return "https://open.bigmodel.cn/api/paas/v4";
    case "minimax":
      return "https://api.minimax.io/v1";
    case "alibaba":
      return "https://dashscope.aliyuncs.com/compatible-mode/v1";
    case "opencode-go":
      return "https://opencode.ai/zen/go/v1";
    case "opencode-zen":
      return "https://opencode.ai/zen/v1";
    default:
      return null;
  }
}

/**
 * OpenCode Go/Zen route some models through Anthropic-style `/messages`
 * (not OpenAI `/chat/completions`). See https://opencode.ai/docs/go/
 */
const OPENCODE_ANTHROPIC_STYLE_MODELS = new Set([
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
]);

/** Exported for unit tests. */
export function usesAnthropicMessagesApi(providerId: string, modelId: string): boolean {
  if (providerId === "anthropic") return true;
  if (
    (providerId === "opencode-go" || providerId === "opencode-zen") &&
    OPENCODE_ANTHROPIC_STYLE_MODELS.has(modelId)
  ) {
    return true;
  }
  return false;
}

/**
 * Anthropic official: `{base}/v1/messages`.
 * OpenCode Go/Zen roots already end with `/v1` → `{base}/messages`.
 */
export function resolveAnthropicMessagesUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (/\/v\d+$/i.test(root)) return `${root}/messages`;
  return `${root}/v1/messages`;
}

/** Ensure OpenCode catalog base URLs end with `/v1`. */
export function normalizeVisionBaseUrl(providerId: string, baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  if (!url) return url;
  if (providerId === "opencode-go" || providerId === "opencode-zen") {
    if (!/\/v\d+$/i.test(url)) url = `${url}/v1`;
  }
  return url;
}

function getProviderCredentials(providerId: string): { apiKey: string; baseUrl: string } {
  const settings = getSettings();
  const apiKey = settings.aiApiKeys?.[providerId]?.trim() ?? "";
  const customProviders = settings.aiCustomProviders as
    | Array<{ id: string; baseUrl?: string }>
    | undefined;
  const customBase =
    customProviders?.find((p) => p.id === providerId)?.baseUrl?.trim() ?? "";
  const rawBase =
    (settings.aiBaseUrls as Record<string, string> | undefined)?.[providerId]?.trim() ||
    customBase ||
    getDefaultBaseUrl(providerId) ||
    "";
  const baseUrl = normalizeVisionBaseUrl(providerId, rawBase);
  if (!apiKey) {
    throw new Error(`Vision helper provider "${providerId}" is missing an API key.`);
  }
  if (!baseUrl) {
    throw new Error(`Vision helper provider "${providerId}" is missing a Base URL.`);
  }
  return { apiKey, baseUrl };
}

function cacheKey(providerId: string, modelId: string, image: VisionFallbackImageInput): string {
  const digest = createHash("sha256")
    .update(CACHE_VERSION)
    .update(providerId)
    .update(modelId)
    .update(image.mimeType)
    .update(image.data)
    .digest("hex");
  return `${providerId}/${modelId}:${digest}`;
}

function remember(key: string, text: string): void {
  imageDescriptionCache.set(key, text);
  while (imageDescriptionCache.size > CACHE_MAX_ITEMS) {
    const oldestKey = imageDescriptionCache.keys().next().value;
    if (!oldestKey) break;
    imageDescriptionCache.delete(oldestKey);
  }
}

async function throwHttpError(response: Response, url: string): Promise<never> {
  let detail = "";
  try {
    detail = (await response.text()).trim().slice(0, 240);
  } catch {
    /* ignore */
  }
  const suffix = detail ? `: ${detail}` : "";
  throw new Error(`Vision helper request failed (${response.status}) ${url}${suffix}`);
}

async function describeViaOpenAiCompatible(
  providerId: string,
  modelId: string,
  image: VisionFallbackImageInput,
): Promise<string> {
  const { apiKey, baseUrl } = getProviderCredentials(providerId);
  const url = `${baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_DESCRIPTION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.data}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) await throwHttpError(response, url);
  const json = (await response.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  throw new Error("Vision helper returned an empty description.");
}

async function describeViaAnthropic(
  providerId: string,
  modelId: string,
  image: VisionFallbackImageInput,
): Promise<string> {
  const { apiKey, baseUrl } = getProviderCredentials(providerId);
  const url = resolveAnthropicMessagesUrl(baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "x-api-key": apiKey,
  };
  // OpenCode catalog accepts x-api-key; keep Bearer as well for compatible proxies.
  if (providerId === "opencode-go" || providerId === "opencode-zen") {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1200,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_DESCRIPTION_PROMPT },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.data,
              },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) await throwHttpError(response, url);
  const json = (await response.json()) as any;
  const text = (json?.content ?? [])
    .map((part: any) => (part?.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (text) return text;
  throw new Error("Vision helper returned an empty description.");
}

async function describeViaGoogle(
  modelId: string,
  image: VisionFallbackImageInput,
): Promise<string> {
  const { apiKey, baseUrl } = getProviderCredentials("google");
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: IMAGE_DESCRIPTION_PROMPT },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    }),
  });
  if (!response.ok) await throwHttpError(response, url);
  const json = (await response.json()) as any;
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (text) return text;
  throw new Error("Vision helper returned an empty description.");
}

function resolveHelperModelId(providerId: string, modelId: string): string {
  if (providerId === "opencode-go" || providerId === "opencode-zen") {
    return normalizeOpenCodeModelId(providerId, modelId);
  }
  return modelId.trim();
}

async function describeSingleImage(
  providerId: string,
  modelId: string,
  image: VisionFallbackImageInput,
): Promise<VisionFallbackDescription> {
  const resolvedModelId = resolveHelperModelId(providerId, modelId);
  const key = cacheKey(providerId, resolvedModelId, image);
  const cached = imageDescriptionCache.get(key);
  if (cached) {
    return { name: image.name, text: cached, cached: true };
  }

  const text = usesAnthropicMessagesApi(providerId, resolvedModelId)
    ? await describeViaAnthropic(providerId, resolvedModelId, image)
    : providerId === "google"
      ? await describeViaGoogle(resolvedModelId, image)
      : await describeViaOpenAiCompatible(providerId, resolvedModelId, image);

  remember(key, text);
  return { name: image.name, text, cached: false };
}

export async function describeImagesWithVisionFallback(
  providerId: string,
  modelId: string,
  images: VisionFallbackImageInput[],
): Promise<VisionFallbackDescription[]> {
  if (images.length === 0) return [];
  const resolvedModelId = resolveHelperModelId(providerId, modelId);
  log.info("describeImagesWithVisionFallback", {
    providerId,
    modelId: resolvedModelId,
    via: usesAnthropicMessagesApi(providerId, resolvedModelId) ? "messages" : "chat.completions",
    count: images.length,
  });
  return await Promise.all(
    images.map((image) => describeSingleImage(providerId, resolvedModelId, image)),
  );
}
