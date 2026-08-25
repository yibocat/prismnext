import { formatAskAgentPrPrompt } from "@shared/git-hosting";

export const GH_CLI_INSTALL_URL = "https://cli.github.com/";

/** Composer template for Ask Agent — insert only, never auto-send. */
export function buildAskAgentPrPrompt(input: {
  head: string;
  base: string;
  title?: string;
  commitSubjects?: string[];
  sessionId?: string;
}): string {
  const lines = [formatAskAgentPrPrompt({
    head: input.head,
    base: input.base,
    title: input.title,
  })];
  if (input.commitSubjects?.length) {
    lines.push("", "Recent commits:");
    for (const subject of input.commitSubjects) {
      lines.push(`- ${subject}`);
    }
  }
  if (input.sessionId?.trim()) {
    lines.push("", `Related chat session: ${input.sessionId.trim()}`);
  }
  return lines.join("\n");
}
