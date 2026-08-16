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
  parameters: Type.Object({
    question: Type.String({ minLength: 1, description: "The question prompt to present to the user" }),
    options: Type.Optional(Type.Array(Type.String(), { description: "List of discrete choice options (if applicable)" })),
    multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple choices" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args) {
    const question = str(args.question);
    if (!question) return { ok: false, error: "missing_question" };

    const options = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === "string")
      : undefined;
    const multiSelect = args.multiSelect === true;

    return {
      answered: true,
      question,
      options: options ?? [],
      multiSelect,
      note: "Question acknowledged by host.",
    };
  },
};

export const suggestPlanTool: NativeToolDefinition = {
  name: TOOL_NAMES.suggestPlan,
  label: "Suggest Plan Mode",
  description:
    "Suggest entering Plan mode for complex multi-phase research tasks (hypotheses, factor matrix, protocol design).",
  parameters: Type.Object({
    reason: Type.Optional(Type.String({ description: "One-sentence reason shown on the suggest strip" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args) {
    const reason = str(args.reason);
    return {
      suggested: true,
      accepted: false,
      reason: reason || "Plan mode suggested.",
    };
  },
};

export const INTERACTIVE_TOOLS: NativeToolDefinition[] = [
  questionTool,
  suggestPlanTool,
];
