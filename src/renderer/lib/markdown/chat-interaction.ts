/**
 * Chat ```interaction fence — reference to a persisted Interaction Spec by id.
 *
 * Terminology: this is NOT the chat ```artifact fence (file path preview).
 * Spec files live under `.workbench/interactions/<id>/spec.json` on disk.
 */
import { buildInteractionFenceMarkdown as buildInteractionFenceMarkdownShared } from "../../../shared/interaction-spec";
import { parseKeyedFenceBody } from "../../../shared/chat-fence-parse";

export type ParsedInteractionFence = {
  id: string;
  title?: string;
};

/** Max auto-injected interaction fences per assistant message (matches artifact cap). */
export const CHAT_INTERACTION_AUTO_CAP = 5;

/**
 * Parse ```interaction fence body: `id:` / `title:` lines (unknown keys ignored).
 */
export function parseInteractionFenceContent(raw: string): ParsedInteractionFence | null {
  const parsed = parseKeyedFenceBody(raw, "id");
  if (!parsed) return null;
  return { id: parsed.primary, title: parsed.title };
}

export function buildInteractionFenceMarkdown(id: string, title?: string): string {
  return buildInteractionFenceMarkdownShared(id, title);
}

/** Ids already present as ```interaction fences in prose. */
export function collectEmbeddedInteractionIds(text: string): string[] {
  const out: string[] = [];
  const fenceRe = /```\s*interaction\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const parsed = parseInteractionFenceContent(m[1] ?? "");
    if (parsed?.id) out.push(parsed.id);
  }
  return out;
}

export function assistantTextEmbedsInteractionId(text: string, id: string): boolean {
  const norm = id.trim();
  if (!norm) return false;
  return collectEmbeddedInteractionIds(text).some((embedded) => embedded === norm);
}

export function missingInteractionFencesInText(
  textCorpus: string,
  items: Array<{ id: string; title?: string }>,
): Array<{ id: string; title?: string }> {
  return items.filter((item) => !assistantTextEmbedsInteractionId(textCorpus, item.id));
}

/** Append ```interaction fences when the model forgot to embed after interaction-write. */
export function buildInteractionFallbackMarkdown(
  items: Array<{ id: string; title?: string }>,
): string {
  if (!items.length) return "";
  return items
    .map(({ id, title }) => buildInteractionFenceMarkdown(id, title))
    .join("\n\n");
}
