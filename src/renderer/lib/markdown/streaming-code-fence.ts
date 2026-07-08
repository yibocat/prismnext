/** Language tags we treat as an opening fence info line (no newline yet). */
const KNOWN_FENCE_LANGS = new Set([
  "python", "javascript", "typescript", "tsx", "jsx", "bash", "shell", "sh", "zsh",
  "json", "yaml", "yml", "css", "html", "xml", "markdown", "md", "sql", "tex", "latex",
  "rust", "go", "java", "c", "cpp", "text", "plaintext", "r", "ruby", "php", "swift", "kotlin",
]);

/**
 * Parse the streaming tail when a ``` code fence may be open.
 * Handles multi-line fences, same-line ```code```, and partial streams.
 */
export function parsePendingCodeFence(pending: string): {
  inFence: boolean;
  lang: string;
  code: string;
} {
  if (!pending.startsWith("```")) {
    return { inFence: false, lang: "", code: pending };
  }

  const rest = pending.slice(3);
  if (rest.length === 0) {
    return { inFence: true, lang: "", code: "" };
  }

  const newlineIdx = rest.indexOf("\n");
  if (newlineIdx >= 0) {
    return {
      inFence: true,
      lang: rest.slice(0, newlineIdx).trim(),
      code: rest.slice(newlineIdx + 1),
    };
  }

  // Same-line fence: ```code``` (may still be streaming the closing backticks)
  const closeIdx = rest.indexOf("```");
  if (closeIdx > 0) {
    return { inFence: true, lang: "", code: rest.slice(0, closeIdx) };
  }

  // ```lang with no body yet (waiting for newline)
  const maybeLang = rest.trim();
  if (KNOWN_FENCE_LANGS.has(maybeLang.toLowerCase())) {
    return { inFence: true, lang: maybeLang, code: "" };
  }

  // ```code streaming on one line (e.g. ```xxx before closing backticks)
  return { inFence: true, lang: "", code: rest };
}

/**
 * GFM expects an info line + newline; normalize ```code``` on one line for remark.
 */
export function normalizeSingleLineCodeFences(text: string): string {
  return text.replace(/^```([^\n`]+?)```$/gm, (_, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return "```\n```";

    const spaceIdx = trimmed.search(/\s/);
    if (spaceIdx > 0) {
      const maybeLang = trimmed.slice(0, spaceIdx).toLowerCase();
      if (KNOWN_FENCE_LANGS.has(maybeLang)) {
        const body = trimmed.slice(spaceIdx + 1).trim();
        return `\`\`\`${trimmed.slice(0, spaceIdx)}\n${body}\n\`\`\``;
      }
    }

    return `\`\`\`\n${trimmed}\n\`\`\``;
  });
}
