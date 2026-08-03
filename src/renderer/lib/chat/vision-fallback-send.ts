/**
 * Composer → vision helper → text-only main model.
 *
 * When the chat model lacks native vision, describe attached images via
 * `aiVisionFallbackModel` before `chat:send` (strips ACP image blocks).
 */
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import type { PromptImageAttachment } from "@/lib/chat/composer-attach-file";
import {
  getModel,
  modelSupportsVision,
  prefetchOpenCodeModelsCatalog,
  resolveProviderConfig,
} from "@/lib/providers";
import type { AppSettings } from "@/stores/settings-store";
import { i18n } from "@/lib/i18n";

export type VisionFallbackApplyInput = {
  promptText: string;
  promptImages: PromptImageAttachment[];
  displayBlocks: ContentBlock[];
  settings: AppSettings;
};

export type VisionFallbackApplyResult = {
  promptText: string;
  promptImages: PromptImageAttachment[];
  displayBlocks: ContentBlock[];
  /** Localized note for the user bubble. */
  note: string | null;
};

function withImageAttachmentNotes(
  blocks: ContentBlock[],
  note: string,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== "text" || !block.attachments?.length) return block;
    return {
      ...block,
      attachments: block.attachments.map((att) =>
        att.kind === "image" ? { ...att, note } : att,
      ),
    };
  });
}

function parseHelperRef(ref: string): { providerId: string; modelId: string } | null {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash >= ref.length - 1) return null;
  return { providerId: ref.slice(0, slash), modelId: ref.slice(slash + 1) };
}

/** User-facing message for vision-fallback failures (already localized). */
export function visionFallbackErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return i18n.t("chat.visionFallback.describeFailedGeneric");
}

/**
 * If images are attached and the main model cannot see them, describe via the
 * Settings multimodal helper and return text-only prompt payloads.
 *
 * Throws Error with a localized user-facing message on configuration / API failure.
 */
export async function applyVisionFallbackForSend(
  input: VisionFallbackApplyInput,
): Promise<VisionFallbackApplyResult> {
  const { promptImages, promptText, displayBlocks, settings } = input;
  if (promptImages.length === 0) {
    return { promptText, promptImages, displayBlocks, note: null };
  }

  // OpenCode Go/Zen model rows (incl. vision flags) live in an async catalog.
  // Settings may have selected a helper while the catalog was warm; chat send
  // must not race an empty cache and reject a valid helper.
  await prefetchOpenCodeModelsCatalog();

  const currentProviderId = settings.aiProvider?.trim() || "";
  const currentProvider = currentProviderId
    ? resolveProviderConfig(currentProviderId, settings.aiCustomProviders)
    : undefined;
  const currentModelId = settings.aiModel ?? currentProvider?.defaultModel ?? "";
  const currentModel = currentProviderId && currentModelId
    ? getModel(
        currentProviderId,
        currentModelId,
        settings.aiCustomModelsData,
        settings.aiCustomProviders,
      )
    : undefined;

  if (modelSupportsVision(currentModel)) {
    return { promptText, promptImages, displayBlocks, note: null };
  }

  const helperRef = settings.aiVisionFallbackModel?.trim();
  if (!helperRef) {
    throw new Error(i18n.t("chat.visionFallback.helperRequired"));
  }

  const parsed = parseHelperRef(helperRef);
  if (!parsed) {
    throw new Error(i18n.t("chat.visionFallback.helperInvalid"));
  }

  const { providerId: helperProviderId, modelId: helperModelId } = parsed;
  const helperApiKey = settings.aiApiKeys?.[helperProviderId]?.trim();
  if (!helperApiKey) {
    throw new Error(i18n.t("chat.visionFallback.helperMissingKey"));
  }

  const helperModel = getModel(
    helperProviderId,
    helperModelId,
    settings.aiCustomModelsData,
    settings.aiCustomProviders,
  );
  // Catalog race / stale snapshot without capabilities.vision: still call the
  // helper — Settings only lists vision-capable models; API will reject if wrong.
  if (helperModel && !modelSupportsVision(helperModel)) {
    throw new Error(i18n.t("chat.visionFallback.helperNotVision"));
  }

  const helperLabel = helperModel?.name ?? helperModelId;
  const chatStore = useChatStore.getState();
  const tabId = chatStore.activeTabId;

  // One frame of generic “planning” before识图 — resend / fast compile can otherwise
  // set describing_images in the same paint as isStreaming and skip the intro label.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  chatStore._setPreparePhase(tabId, "describing_images");
  try {
    let result: Awaited<ReturnType<typeof window.electronAPI.chatDescribeImages>>;
    try {
      result = await window.electronAPI.chatDescribeImages({
        providerId: helperProviderId,
        modelId: helperModelId,
        images: promptImages,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        i18n.t("chat.visionFallback.describeFailed", { message: detail }),
      );
    }

    const descriptionBlocks = result.descriptions.map((desc, i) =>
      [
        `### Image ${i + 1}: ${desc.name}`,
        desc.cached ? `- via: ${helperLabel} (cached)` : `- via: ${helperLabel}`,
        desc.text.trim(),
      ].join("\n\n"),
    );

    const note = i18n.t("chat.visionFallback.describedNote", { model: helperLabel });
    return {
      // Agent-facing scaffold stays English (model prompt, not UI chrome).
      promptText: [
        "## Attached images (via vision fallback)",
        "",
        ...descriptionBlocks,
        "",
        promptText,
      ].join("\n"),
      promptImages: [],
      displayBlocks: withImageAttachmentNotes(displayBlocks, note),
      note,
    };
  } finally {
    // Hand off to main-model send — avoid flashing generic “planning” again right
    // after识图 (reads as识图 → planning). chat:send will overwrite with its phases.
    if (
      useChatStore.getState().tabs.find((t) => t.id === tabId)?.preparePhase
      === "describing_images"
    ) {
      useChatStore.getState()._setPreparePhase(tabId, "waiting_model");
    }
  }
}
