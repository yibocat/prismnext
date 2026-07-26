/**
 * Chat ```interaction fence — reference to a persisted Interaction Spec by id.
 */
import { buildInteractionFenceMarkdown as buildInteractionFenceMarkdownShared } from "../../../shared/interaction-spec";

export type ParsedInteractionFence = {
  id: string;
  title?: string;
};

/**
 * Parse ```interaction fence body: `id:` / `title:` lines (unknown keys ignored).
 */
export function parseInteractionFenceContent(raw: string): ParsedInteractionFence | null {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  let id = "";
  let title: string | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.+)$/.exec(trimmed);
    if (m) {
      const key = m[1]!.toLowerCase();
      const val = m[2]!.trim();
      if (key === "id" && val) id = val;
      else if (key === "title" && val) title = val;
      continue;
    }
    if (!id) id = trimmed;
  }

  id = id.trim();
  if (!id || id.includes("..")) return null;
  return { id, title };
}

export function buildInteractionFenceMarkdown(id: string, title?: string): string {
  return buildInteractionFenceMarkdownShared(id, title);
}
