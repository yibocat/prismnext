/** Detect @mention or /command query at cursor for dropdown triggers. */

export type ComposerQuery =
  | { kind: "mention"; query: string; from: number; to: number }
  | { kind: "slash"; query: string; from: number; to: number };

export function detectQueryAtCursor(doc: string, cursor: number): ComposerQuery | null {
  const lineStart = doc.lastIndexOf("\n", cursor - 1) + 1;
  const before = doc.slice(lineStart, cursor);

  const mentionMatch = before.match(/(?:^|[\s])@([^\s\uE000\uE001\uFFFC]*)$/);
  if (mentionMatch) {
    const query = mentionMatch[1] ?? "";
    const atOffset = before.length - mentionMatch[0].length + (mentionMatch[0].startsWith("@") ? 0 : 1);
    return { kind: "mention", query, from: lineStart + atOffset, to: cursor };
  }

  const slashMatch = before.match(/(?:^|[\s])\/([\w-]*)$/);
  if (slashMatch) {
    const query = slashMatch[1] ?? "";
    const slashOffset = before.length - slashMatch[0].length + (slashMatch[0].startsWith("/") ? 0 : 1);
    return { kind: "slash", query, from: lineStart + slashOffset, to: cursor };
  }

  return null;
}
