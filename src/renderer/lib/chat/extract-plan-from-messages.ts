import type { ResearchPlanStep } from "../../../shared/research-plan";
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

function collectAssistantText(message: ChatStreamMessage): string {
  const blocks = message.message?.content;
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const block of blocks as ContentBlock[]) {
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push(block.text.trim());
    }
  }
  return parts.join("\n\n").trim();
}

/**
 * Optional: numbered steps under an explicit implementation heading.
 * Do **not** use this to build the plan file body — greedy numbered-list scraping
 * shreds diagnosis essays into fake “Steps”.
 */
export function extractStepsFromPlanMarkdown(markdown: string): ResearchPlanStep[] {
  const text = markdown.trim();
  if (!text) return [];

  const sectionMatch = text.match(
    /(?:^|\n)#{1,3}\s*[^\n]*(?:落地步骤|实施步骤|Suggested Implementation|Implementation Steps|下一步)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---\s*$|$)/i,
  );
  const region = sectionMatch?.[1];
  if (!region) return [];

  const steps: ResearchPlanStep[] = [];
  for (const line of region.split("\n")) {
    const m = line.trim().match(/^\d+\.\s+(.+)$/);
    if (!m?.[1]) continue;
    steps.push({ text: m[1].trim(), status: "pending" });
  }
  return steps;
}

export function extractPlanDraftFromMessages(messages: ChatStreamMessage[]): {
  title: string | null;
  /** Full assistant plan markdown — this is the formal plan body. */
  body: string;
  /** Only filled when an explicit “落地步骤” section exists (never the whole essay). */
  steps: ResearchPlanStep[];
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!;
    if (msg.type !== "assistant") continue;
    const text = collectAssistantText(msg);
    if (text.length < 40) continue;

    const titleMatch = text.match(/^#{1,2}\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || null;
    const steps = extractStepsFromPlanMarkdown(text);

    return { title, body: text, steps };
  }
  return null;
}

export function tabHasApprovingPlanContent(
  planDraftSteps: ResearchPlanStep[],
  messages: ChatStreamMessage[],
): boolean {
  if (planDraftSteps.length > 0) return true;
  return extractPlanDraftFromMessages(messages) != null;
}
