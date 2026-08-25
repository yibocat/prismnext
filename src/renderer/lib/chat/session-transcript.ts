import type { ContentBlock, Conversation, ConversationTurn } from "@shared/agent/conversation";

function textFromBlocks(blocks: ContentBlock[] | undefined): string {
  if (!blocks?.length) return "";
  return blocks
    .filter((block) => block.type === "text" && Boolean(block.text?.trim()))
    .map((block) => block.text!.trim())
    .join("\n\n");
}

function appendTurn(lines: string[], turn: Pick<ConversationTurn, "user" | "assistant">): void {
  const user = textFromBlocks(turn.user.blocks);
  const assistant = textFromBlocks(turn.assistant.blocks);
  if (user) {
    lines.push("## User", "", user, "");
  }
  if (assistant) {
    lines.push("## Assistant", "", assistant, "");
  }
}

/** Plain-text markdown transcript: text blocks only, no tool / thinking dump. */
export function formatConversationTranscript(
  conv: Conversation | null | undefined,
  title?: string,
): string {
  const heading = (title || conv?.title || "Untitled").trim() || "Untitled";
  const lines: string[] = [`# ${heading}`, ""];
  for (const turn of conv?.turns ?? []) {
    appendTurn(lines, turn);
  }
  if (conv?.live) {
    appendTurn(lines, conv.live);
  }
  return `${lines.join("\n").trim()}\n`;
}

export function transcriptHasBody(markdown: string): boolean {
  return /(?:^|\n)## (?:User|Assistant)\n/.test(markdown);
}
