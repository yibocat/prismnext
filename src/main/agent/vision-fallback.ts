import { createHash } from "node:crypto";
import { createLogger } from "../app/logger";
import { getSettings } from "../services/settings";
import { piProviderBaseUrl } from "../../shared/providers/pi-catalog";

const log = createLogger("vision-fallback", "agent");

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
  /** Optional focus question from the requester (image-describe tool). */
  question?: string;
}

export interface VisionFallbackDescription {
  name: string;
  text: string;
  cached: boolean;
}

function getDefaultBaseUrl(providerId: string): string | null {
  return piProviderBaseUrl(providerId) ?? null;
}

/**
 * Pi providers that route models through Anthropic-style `/messages`
 * (not OpenAI `/chat/completions`).
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
    (providerId === "opencode-go" || providerId === "opencode") &&
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

/** Ensure Pi catalog base URLs end with `/v1`. */
export function normalizeVisionBaseUrl(providerId: string, baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  if (!url) return url;
  if (providerId === "opencode-go" || providerId === "opencode") {
    if (!/\/v\d+$/i.test(url)) url = `${url}/v1`;
  }
  return url;
}

function getProviderCredentials(providerId: string): { apiKey: string; baseUrl: string } {
  const settings = getSettings();
  const apiKey = settings.aiApiKeys?.[providerId]?.trim() ?? "";
  const customProviders = settings.aiCustomProviders;
  const customBase =
    customProviders?.find((p) => p.id === providerId)?.baseUrl?.trim() ?? "";
  const rawBase =
    settings.aiBaseUrls?.[providerId]?.trim() ||
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

function promptForImage(image: VisionFallbackImageInput): string {
  const question = image.question?.trim();
  if (!question) return IMAGE_DESCRIPTION_PROMPT;
  return `${IMAGE_DESCRIPTION_PROMPT}\n\nThe requester asked specifically: ${question}`;
}

function cacheKey(providerId: string, modelId: string, image: VisionFallbackImageInput): string {
  const digest = createHash("sha256")
    .update(CACHE_VERSION)
    .update(providerId)
    .update(modelId)
    .update(image.mimeType)
    .update(image.data)
    .update(image.question?.trim() ?? "")
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
            { type: "text", text: promptForImage(image) },
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
  // Pi catalog accepts x-api-key; keep Bearer as well for compatible proxies.
  if (providerId === "opencode-go" || providerId === "opencode") {
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
            { type: "text", text: promptForImage(image) },
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
            { text: promptForImage(image) },
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

/**
 * Parse a "provider/model" helper ref (Settings → Models → Multimodal helper).
 * Returns null when unset or malformed.
 */
export function parseVisionHelperModelRef(
  ref: string | null | undefined,
): { providerId: string; modelId: string } | null {
  const raw = ref?.trim() ?? "";
  const slash = raw.indexOf("/");
  if (slash <= 0 || slash >= raw.length - 1) return null;
  return { providerId: raw.slice(0, slash), modelId: raw.slice(slash + 1) };
}

/** Configured multimodal helper from Settings, or null when unset/malformed. */
export function resolveVisionHelperFromSettings(): { providerId: string; modelId: string } | null {
  return parseVisionHelperModelRef(getSettings().aiVisionFallbackModel);
}

/**
 * Main-process entry point (image-describe bridge): describe images with the
 * user-configured multimodal helper — no renderer-passed provider/model args.
 * Throws an actionable Error when no helper is configured; provider credentials
 * resolve from Settings inside the describe path (getProviderCredentials).
 */
export async function describeImagesWithConfiguredHelper(
  images: VisionFallbackImageInput[],
): Promise<VisionFallbackDescription[]> {
  const helper = resolveVisionHelperFromSettings();
  if (!helper) {
    throw new Error(
      "No multimodal helper model is configured. Ask the user to pick one under Settings → Models → Multimodal helper, then retry.",
    );
  }
  return describeImagesWithVisionFallback(helper.providerId, helper.modelId, images);
}
