import type { ComposerPart } from "@/lib/chat/composer-parts";
import { isComposerEmpty } from "@/lib/chat/composer-parts";
import type { ComposerAttachment } from "@/lib/chat/composer-attach-file";
import {
  buildComposerDisplayBlocks,
  compileComposerPrompt,
} from "@/components/modules/chat/inline-composer";
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useCommandStore } from "@/stores/command-store";
import { useSettingsStore } from "@/stores/settings-store";
import { applyVisionFallbackForSend, visionFallbackErrorMessage } from "@/lib/chat/vision-fallback-send";
import { toast } from "sonner";

/** Display parts for editing a historical user bubble. */
export function extractUserMessageEditParts(msg: ChatStreamMessage): {
  parts: ComposerPart[];
  attachments: ComposerAttachment[];
} {
  const allBlocks = (msg.message?.content ?? []) as ContentBlock[];
  const inlineParts: ComposerPart[] = [];
  const attachments: ComposerAttachment[] = [];
  const seenAtt = new Set<string>();

  for (const b of allBlocks) {
    if (b.type === "text" && b.inlineParts?.length) {
      inlineParts.push(...b.inlineParts);
    }
    if (b.type === "text" && b.attachments?.length) {
      for (const att of b.attachments) {
        const abs = att.path;
        if (!abs || seenAtt.has(abs)) continue;
        seenAtt.add(abs);
        attachments.push({
          id: `hist-${abs}`,
          fileId: abs,
          name: att.name || abs.split(/[/\\]/).pop() || "file",
          absolutePath: abs,
          displayPath: att.path,
          kind: att.kind === "image" ? "image" : "file",
          previewUrl: att.previewUrl,
        });
      }
    }
  }

  if (inlineParts.length > 0) {
    return { parts: inlineParts, attachments };
  }

  const text = allBlocks
    .filter((b) => {
      if (b.type !== "text" || !b.text) return false;
      const t = b.text;
      if (
        t.startsWith("## Role")
        && (t.includes("integrated into prismnext")
          || t.includes("integrated into Prism")
          || t.includes("LaTeX academic paper writing workspace")
          || t.includes("## Core Rules"))
      ) {
        return false;
      }
      return true;
    })
    .map((b) => b.text!)
    .join("\n");

  return {
    parts: text ? [{ type: "text", text }] : [{ type: "text", text: "" }],
    attachments,
  };
}

/**
 * World-rollback to the start of `turnIndex` (end of turnIndex - 1), then
 * send `parts` as a new user turn (edit & resend). Regret survives the
 * rebound turn's finalize so the user can undo after the new answer lands.
 */
export async function resendFromUserTurn(opts: {
  tabId: string;
  turnIndex: number;
  parts: ComposerPart[];
  attachments?: ComposerAttachment[];
}): Promise<void> {
  const { tabId, turnIndex, parts, attachments = [] } = opts;
  const store = useChatStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab || tab.isStreaming) return;
  if (isComposerEmpty(parts) && attachments.length === 0) return;

  const keepThrough = turnIndex - 1;
  await useCheckpointStore.getState().rollbackToTurn(tabId, keepThrough, {
    preserveRegretAcrossNextFinalize: true,
  });

  const expandCommand = useCommandStore.getState().expandCommand;
  const hasImages = attachments.some((a) => a.kind === "image");
  if (hasImages) {
    // Match composer: stream on early so the first wait frame is “planning”, not识图.
    store._setStreaming(tabId, true);
    store._setPreparePhase(tabId, null);
  }

  const compiled = await compileComposerPrompt(parts, expandCommand, [], attachments);
  let displayBlocks = buildComposerDisplayBlocks(parts, attachments);
  let promptText = compiled.promptText;
  let promptImages = compiled.promptImages;

  if (compiled.promptImages.length > 0) {
    try {
      const applied = await applyVisionFallbackForSend({
        promptText: compiled.promptText,
        promptImages: compiled.promptImages,
        displayBlocks,
        settings: useSettingsStore.getState().settings,
      });
      promptText = applied.promptText;
      promptImages = applied.promptImages;
      displayBlocks = applied.displayBlocks;
    } catch (err) {
      store._setStreaming(tabId, false);
      toast.error(visionFallbackErrorMessage(err));
      return;
    }
  }

  await store.sendPrompt(promptText, displayBlocks, false, {
    skillIds: compiled.skillIds,
    mcpServerAllowlist: compiled.mcpServerNames,
    hasPaperSnippets: compiled.paperSnippetCount > 0,
    selectedExpertIds: compiled.selectedExpertIds,
    orchestratorId: store.tabs.find((t) => t.id === tabId)?.orchestratorId ?? null,
    sessionTeamId: store.tabs.find((t) => t.id === tabId)?.sessionTeamId ?? null,
    promptImages,
    promptFiles: compiled.promptFiles,
  });
}
