/** Inline composer token types — structured refs embedded in user message text. */

export type ComposerPart =
  | { type: "text"; text: string }
  | {
      type: "mention";
      mentionType: "file";
      id: string;
      label: string;
      filePath: string;
      fileId: string;
    }
  | {
      type: "mention";
      mentionType: "profile";
      id: string;
      label: string;
      profileId: string;
    }
  | {
      type: "command";
      id: string;
      label: string;
      commandName: string;
      action?: string;
      source: string;
    };

export type ComposerDraft = {
  parts: ComposerPart[];
};

export function isComposerEmpty(parts: ComposerPart[]): boolean {
  return parts.length === 0 || parts.every((p) => p.type === "text" && !p.text.trim());
}

export function createTokenId(): string {
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function plainLabelForPart(part: ComposerPart): string {
  if (part.type === "text") return part.text;
  if (part.type === "mention") return `@${part.label}`;
  return `/${part.label}`;
}

/** Flatten parts to human-readable plain text (for copy / session title). */
export function partsToPlainText(parts: ComposerPart[]): string {
  return parts.map(plainLabelForPart).join("");
}
