import { isPlanControlUserText } from "../../../shared/research/plan";
import type { ChatStreamMessage } from "@/stores/chat-store";

/** Mirrors main `PlanUiEvent` — keep fields in sync. */
export type PlanUiEvent =
  | {
      kind: "plan-artifact";
      path: string;
      title?: string;
      discarded?: boolean;
      afterIndex: number;
    }
  | {
      kind: "plan-decision";
      decision: "approved" | "rejected";
      path?: string;
      title?: string;
      afterIndex: number;
    };

function eventToMessage(event: PlanUiEvent): ChatStreamMessage {
  if (event.kind === "plan-artifact") {
    return {
      type: "plan-artifact",
      planPath: event.discarded ? undefined : event.path || undefined,
      planTitle: event.title,
      planDiscarded: !!event.discarded,
      result: event.title,
    };
  }
  return {
    type: "plan-decision",
    planDecision: event.decision,
    planTitle: event.title,
    planPath: event.path,
    result: event.title,
  };
}

function userMessagePlainText(msg: ChatStreamMessage): string {
  const content = msg.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text || "")
    .join("\n");
}

/**
 * Drop silent Approve/Deny control *user* bubbles only.
 * Do NOT strip following assistants — Approve kicks off real Build work that must stay.
 */
export function stripPlanControlTurns(
  messages: ChatStreamMessage[],
): ChatStreamMessage[] {
  return messages.filter((msg) => {
    if (msg.type !== "user") return true;
    return !isPlanControlUserText(userMessagePlainText(msg));
  });
}

/** Insert persisted plan cards into OpenCode-hydrated messages by `afterIndex`. */
export function mergePlanUiEvents(
  messages: ChatStreamMessage[],
  events: PlanUiEvent[] | null | undefined,
): ChatStreamMessage[] {
  if (!events?.length) return messages;

  const sorted = [...events].sort((a, b) => {
    if (a.afterIndex !== b.afterIndex) return a.afterIndex - b.afterIndex;
    // Same anchor: artifact before decision.
    if (a.kind === b.kind) return 0;
    return a.kind === "plan-artifact" ? -1 : 1;
  });
  const result: ChatStreamMessage[] = [];
  let ei = 0;

  for (let i = 0; i <= messages.length; i += 1) {
    while (ei < sorted.length && sorted[ei]!.afterIndex === i) {
      result.push(eventToMessage(sorted[ei]!));
      ei += 1;
    }
    if (i < messages.length) result.push(messages[i]!);
  }
  while (ei < sorted.length) {
    result.push(eventToMessage(sorted[ei]!));
    ei += 1;
  }
  return result;
}

/**
 * Count OpenCode user/assistant messages only — matches hydrate payload shape.
 * (Do not count system/result/action-status or plan cards.)
 */
export function countOpenCodeMessages(messages: ChatStreamMessage[]): number {
  return messages.filter((m) => m.type === "user" || m.type === "assistant").length;
}

/** Latest Created Plan card state from persisted plan events. */
export function planArtifactCardFromEvents(
  events: PlanUiEvent[] | null | undefined,
): { path: string; title?: string; discarded: boolean } | null {
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.kind !== "plan-artifact") continue;
    return {
      path: e.discarded ? "" : e.path,
      title: e.title,
      discarded: !!e.discarded,
    };
  }
  return null;
}
