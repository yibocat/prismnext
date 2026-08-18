/**
 * Native Interactive Question and Plan Tools for PrismNext Pi Agent Host.
 *
 * 2 tools covering user questioning and Plan mode suggestion.
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/tool-names";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const questionTool: NativeToolDefinition = {
  name: TOOL_NAMES.question,
  label: "Ask User Question",
  description:
    "Ask the user a question and wait for their answer before continuing. " +
    "Use when you need clarification, a decision between discrete choices, or confirmation.",
  promptGuidelines: [
    "The turn is paused while the user answers — this is for REAL clarification, not a formality. Do not ask when you can decide from context; do not ask multiple trivial questions.",
    "Prefer discrete `options` when there is a small set of choices; `multiSelect: true` for choosing several of them.",
    "Handle `cancelled: true` in the result gracefully and continue with a reasonable default.",
  ],
  parameters: Type.Object({
    question: Type.String({ minLength: 1, description: "The question prompt to present to the user" }),
    options: Type.Optional(Type.Array(Type.String(), { description: "List of discrete choice options (if applicable)" })),
    multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple choices" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const question = str(args.question);
    if (!question) return { ok: false, error: "missing_question" };

    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string")
      : undefined;
    const multiSelect = args.multiSelect === true;

    if (!ctx.askUser) {
      return { ok: false, error: "question_broker_missing" };
    }

    const answered = await ctx.askUser({ prompt: question, options, multiSelect });
    return {
      answered: answered.ok,
      question,
      options: options ?? [],
      multiSelect,
      answer: answered.answer,
      selected: answered.selected,
      cancelled: answered.cancelled,
      reason: answered.reason,
    };
  },
};

export const suggestPlanTool: NativeToolDefinition = {
  name: TOOL_NAMES.suggestPlan,
  label: "Suggest Plan Mode",
  description:
    "Suggest entering Plan mode for complex multi-phase research tasks (hypotheses, factor matrix, protocol design).",
  promptGuidelines: [
    "Use when the task benefits from a written, approved plan before execution — multi-step research, experimental design, manuscript restructure.",
    "Do not use for simple or single-step tasks; do not call it repeatedly in one turn.",
    "If the suggestion is not accepted, continue working directly without re-proposing.",
  ],
  parameters: Type.Object({
    reason: Type.Optional(Type.String({ description: "One-sentence reason shown on the suggest strip" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const reason = str(args.reason) || "Plan mode suggested.";
    if (!ctx.suggestPlan) {
      return { ok: false, error: "plan_suggest_broker_missing" };
    }
    const result = await ctx.suggestPlan({ reason });
    return {
      suggested: true,
      accepted: result.accepted,
      reason: result.reason || reason,
    };
  },
};

export const INTERACTIVE_TOOLS: NativeToolDefinition[] = [
  questionTool,
  suggestPlanTool,
];
