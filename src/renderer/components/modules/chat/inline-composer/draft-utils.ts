import type { ComposerPart } from "@/lib/chat/composer-parts";
import { createTokenId, mergeAdjacentText, partsToPlainText } from "@/lib/chat/composer-parts";
import { parseDraftJson } from "./serialize";

export interface ComposerTabDraft {
  input: string;
  parts?: ComposerPart[];
  chips?: { id: string; commandName: string; action?: string; source: string }[];
  /** @deprecated legacy expert/profile chip — migrated on load */
  profileChip?: { id: string; profileId: string; profileName: string } | null;
}

function normalizeLegacyMention(part: ComposerPart): ComposerPart {
  if (part.type !== "mention") return part;
  if (part.mentionType === "expert") return part;
  const legacy = part as ComposerPart & { mentionType: "profile"; profileId: string };
  if (legacy.mentionType === "profile") {
    return {
      type: "mention",
      mentionType: "expert",
      id: legacy.id,
      label: legacy.label,
      expertId: legacy.profileId,
    };
  }
  return part;
}

/** Restore composer parts from tab draft (inline JSON or legacy chips). */
export function loadDraftParts(draft?: ComposerTabDraft): ComposerPart[] {
  if (draft?.parts && draft.parts.length > 0) {
    return mergeAdjacentText(draft.parts.map(normalizeLegacyMention));
  }

  const hasLegacyChips = (draft?.chips?.length ?? 0) > 0 || !!draft?.profileChip;
  if (!hasLegacyChips) {
    return parseDraftJson(draft?.input).map(normalizeLegacyMention);
  }

  const parts: ComposerPart[] = [];

  if (draft?.profileChip) {
    parts.push({
      type: "mention",
      mentionType: "expert",
      id: draft.profileChip.id || createTokenId(),
      label: draft.profileChip.profileName,
      expertId: draft.profileChip.profileId,
    });
  }

  for (const chip of draft?.chips ?? []) {
    parts.push({
      type: "command",
      id: chip.id || createTokenId(),
      label: chip.commandName,
      commandName: chip.commandName,
      action: chip.action,
      source: chip.source,
    });
  }

  const legacyText = draft?.input?.trim();
  if (legacyText && !legacyText.startsWith("{")) {
    parts.push({ type: "text", text: legacyText });
  }

  if (parts.length === 0) {
    return [{ type: "text", text: "" }];
  }

  return mergeAdjacentText(parts);
}

export function saveDraftFromParts(parts: ComposerPart[]): ComposerTabDraft {
  return {
    input: partsToPlainText(parts),
    parts: mergeAdjacentText(parts),
  };
}
