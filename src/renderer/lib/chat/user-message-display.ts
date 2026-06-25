import type { ContentBlock } from "@/stores/chat-store";

/** Agent-only sections injected by compileComposerPrompt — never show in UI. */
const COMPILED_SECTION_HEADERS = [
  "## Referenced files",
  "## Terminal context",
  "## Code context",
  "## Command instructions",
] as const;

function isCompiledSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  return COMPILED_SECTION_HEADERS.some((h) => trimmed === h);
}

/**
 * Strip agent-only compiled sections from a persisted user prompt, keeping the
 * user's actual message line(s). Used when display snapshots are missing.
 */
export function stripCompiledPromptSections(text: string): string {
  if (!text) return text;
  if (!COMPILED_SECTION_HEADERS.some((h) => text.includes(h))) return text;

  const lines = text.split("\n");
  let lineIdx = 0;

  while (lineIdx < lines.length) {
    if (!isCompiledSectionHeader(lines[lineIdx])) break;

    lineIdx++;
    while (lineIdx < lines.length && lines[lineIdx].trim() === "") lineIdx++;

    while (lineIdx < lines.length) {
      if (lines[lineIdx].trim() === "" && lineIdx + 1 < lines.length) {
        const next = lines[lineIdx + 1].trim();
        if (isCompiledSectionHeader(next)) {
          lineIdx++;
          break;
        }
        lineIdx++;
        return lines.slice(lineIdx).join("\n").trim();
      }
      lineIdx++;
    }
  }

  return lines.slice(lineIdx).join("\n").trim();
}

/** True when text is OpenCode patch metadata leaked as a text part. */
export function isPatchMetadataText(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(t) as { type?: string; hash?: string; files?: unknown };
    return parsed.type === "patch" && typeof parsed.hash === "string";
  } catch {
    return false;
  }
}

/** Hide compiled prompt noise and internal metadata from user message blocks. */
export function sanitizeUserContentBlocksForDisplay(
  blocks: ContentBlock[],
): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "text" || !block.text) {
      out.push(block);
      continue;
    }
    if (block.inlineParts?.length) {
      out.push(block);
      continue;
    }
    if (isPatchMetadataText(block.text)) continue;
    const stripped = stripCompiledPromptSections(block.text);
    if (stripped) out.push({ ...block, text: stripped });
  }
  return out;
}
