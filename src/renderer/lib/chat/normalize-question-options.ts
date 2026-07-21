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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNestedQuestion(input: Record<string, unknown>): Record<string, unknown> | null {
  const questions = input.questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return asRecord(questions[0]);
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

  const topOptions = normalizeQuestionOptions(root.options);
  const nestedOptions = nested ? normalizeQuestionOptions(nested.options) : [];

  const multiSelect =
    root.multiSelect === true
    || nested?.multiple === true
    || nested?.multiSelect === true;

  return {
    question: topQuestion || nestedQuestion || nestedHeader,
    options: topOptions.length > 0 ? topOptions : nestedOptions,
    multiSelect,
  };
}
