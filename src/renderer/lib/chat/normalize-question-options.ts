import type { ContentBlock } from "@/stores/chat-store";

export type QuestionOptionView = {
  /** Stable key for selection Set */
  key: string;
  label: string;
  description?: string;
};

export type QuestionPromptView = {
  question: string;
  options: QuestionOptionView[];
  multiSelect: boolean;
};

/** Merge tool_use.input with late ACP backfill payload. */
export function resolveQuestionToolInput(
  toolUse: Pick<ContentBlock, "input"> & { _backfillInput?: unknown },
): Record<string, unknown> {
  const primary = toolUse.input;
  const backfill = toolUse._backfillInput;
  const pick =
    primary && typeof primary === "object" && !Array.isArray(primary) && Object.keys(primary).length > 0
      ? primary
      : backfill && typeof backfill === "object" && !Array.isArray(backfill)
        ? backfill
        : primary ?? backfill;
  if (pick && typeof pick === "object" && !Array.isArray(pick)) {
    return pick as Record<string, unknown>;
  }
  return {};
}

/**
 * OpenCode / agents sometimes send options as strings, sometimes as
 * `{ label, description }`. Never pass raw objects into React children.
 */
export function normalizeQuestionOptions(raw: unknown): QuestionOptionView[] {
  if (!Array.isArray(raw)) return [];

  const out: QuestionOptionView[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (typeof item === "string") {
      const label = item.trim();
      if (!label) continue;
      out.push({ key: label, label });
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const label =
        (typeof rec.label === "string" && rec.label.trim())
        || (typeof rec.name === "string" && rec.name.trim())
        || (typeof rec.title === "string" && rec.title.trim())
        || (typeof rec.value === "string" && rec.value.trim())
        || (typeof rec.text === "string" && rec.text.trim())
        || "";
      if (!label) continue;
      const description =
        typeof rec.description === "string" && rec.description.trim()
          ? rec.description.trim()
          : undefined;
      out.push({
        key: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : `${i}:${label}`,
        label,
        description,
      });
    }
  }
  return out;
}

/** When the model lists choices only in prose, recover option rows for the UI. */
export function parseOptionsFromQuestionText(text: string): {
  question: string;
  options: QuestionOptionView[];
} {
  const lines = text.split("\n");
  const optionRows: { lineIndex: number; label: string }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const lettered = line.match(/^\s*[A-Za-z][.)]\s+(.+)$/);
    const label = (bullet?.[1] ?? numbered?.[1] ?? lettered?.[1])?.trim();
    if (label) optionRows.push({ lineIndex: i, label });
  }

  if (optionRows.length < 2) {
    return { question: text.trim(), options: [] };
  }

  const skip = new Set(optionRows.map((r) => r.lineIndex));
  const question = lines
    .filter((_, i) => !skip.has(i))
    .join("\n")
    .trim();

  return {
    question: question || text.trim(),
    options: optionRows.map((r) => ({ key: r.label, label: r.label })),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNestedQuestion(input: Record<string, unknown>): Record<string, unknown> | null {
  const questions = input.questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return asRecord(questions[0]);
}

function firstNonEmptyOptions(...sources: unknown[]): QuestionOptionView[] {
  for (const raw of sources) {
    const opts = normalizeQuestionOptions(raw);
    if (opts.length > 0) return opts;
  }
  return [];
}

/**
 * Normalize tool_use.input for Prism's flat question tool and OpenCode's
 * nested `{ questions: [{ question, header, options, multiple }] }` shape.
 */
export function extractQuestionPrompt(input: unknown): QuestionPromptView {
  const root = asRecord(input) ?? {};
  const nested = readNestedQuestion(root);

  const topQuestion =
    typeof root.question === "string" && root.question.trim()
      ? root.question.trim()
      : "";
  const nestedQuestion =
    nested && typeof nested.question === "string" && nested.question.trim()
      ? nested.question.trim()
      : "";
  const nestedHeader =
    nested && typeof nested.header === "string" && nested.header.trim()
      ? nested.header.trim()
      : "";

  let question = topQuestion || nestedQuestion || nestedHeader;
  let options = firstNonEmptyOptions(
    root.options,
    root.choices,
    nested?.options,
    nested?.choices,
  );

  const multiSelect =
    root.multiSelect === true
    || nested?.multiple === true
    || nested?.multiSelect === true;

  if (options.length === 0 && question) {
    const parsed = parseOptionsFromQuestionText(question);
    if (parsed.options.length > 0) {
      question = parsed.question;
      options = parsed.options;
    }
  }

  return { question, options, multiSelect };
}

export function extractQuestionPromptFromBlock(
  toolUse: Pick<ContentBlock, "input"> & { _backfillInput?: unknown },
): QuestionPromptView {
  return extractQuestionPrompt(resolveQuestionToolInput(toolUse));
}

export function mergeQuestionPromptViews(
  primary: QuestionPromptView,
  secondary: QuestionPromptView | null | undefined,
): QuestionPromptView {
  if (!secondary) return primary;
  return {
    question: primary.question || secondary.question,
    options: primary.options.length >= secondary.options.length
      ? primary.options
      : secondary.options,
    multiSelect: primary.multiSelect || secondary.multiSelect,
  };
}
