import type { ComposerPart } from "@/lib/chat/composer-parts";
import { isComposerEmpty } from "@/lib/chat/composer-parts";
import type { ComposerAttachment } from "@/lib/chat/composer-attach-file";

/** Snapshot of a composer submission waiting while a turn is in flight. */
export interface ComposerQueueItem {
  id: string;
  parts: ComposerPart[];
  pinnedContexts: Array<{
    label: string;
    filePath: string;
    selectedText: string;
  }>;
  attachments: ComposerAttachment[];
  createdAt: number;
}

export function createComposerQueueItemId(): string {
  return `cq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** One-line preview for the queue list. */
export function composerQueueItemPreview(item: ComposerQueueItem): string {
  const chunks: string[] = [];
  for (const part of item.parts) {
    if (part.type === "text") {
      const t = part.text.replace(/\s+/g, " ").trim();
      if (t) chunks.push(t);
    } else if ("label" in part && typeof part.label === "string" && part.label.trim()) {
      chunks.push(part.label.trim());
    }
  }
  for (const ctx of item.pinnedContexts) {
    if (ctx.label?.trim()) chunks.push(ctx.label.trim());
  }
  for (const att of item.attachments) {
    if (att.name?.trim()) chunks.push(att.name.trim());
  }
  const text = chunks.join(" ").trim();
  if (!text) return "(empty)";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function isComposerQueuePayloadEmpty(item: Pick<
  ComposerQueueItem,
  "parts" | "pinnedContexts" | "attachments"
>): boolean {
  return (
    isComposerEmpty(item.parts)
    && item.pinnedContexts.length === 0
    && item.attachments.length === 0
  );
}

/** Merge multiple queued messages into one send payload (empty Enter / flush-all). */
export function combineComposerQueueItems(items: ComposerQueueItem[]): ComposerQueueItem {
  const parts: ComposerPart[] = [];
  const pinnedContexts: ComposerQueueItem["pinnedContexts"] = [];
  const attachments: ComposerAttachment[] = [];
  const seenPin = new Set<string>();
  const seenAtt = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0 && item.parts.length > 0 && parts.length > 0) {
      parts.push({ type: "text", text: "\n\n" });
    }
    parts.push(...item.parts);

    for (const ctx of item.pinnedContexts) {
      const key = `${ctx.filePath}\0${ctx.selectedText}`;
      if (seenPin.has(key)) continue;
      seenPin.add(key);
      pinnedContexts.push(ctx);
    }
    for (const att of item.attachments) {
      if (seenAtt.has(att.absolutePath)) continue;
      seenAtt.add(att.absolutePath);
      attachments.push(att);
    }
  }

  return {
    id: createComposerQueueItemId(),
    parts,
    pinnedContexts,
    attachments,
    createdAt: Date.now(),
  };
}

/** Append queue parts after existing draft (re-edit). */
export function appendComposerParts(
  existing: ComposerPart[],
  incoming: ComposerPart[],
): ComposerPart[] {
  if (incoming.length === 0) return existing;
  if (isComposerEmpty(existing)) return [...incoming];
  return [...existing, { type: "text", text: "\n" }, ...incoming];
}
