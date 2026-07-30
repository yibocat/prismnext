import { describe, expect, it } from "vitest";
import {
  extractQuestionPrompt,
  normalizeQuestionOptions,
} from "../../src/renderer/lib/chat/normalize-question-options";

describe("normalizeQuestionOptions", () => {
  it("keeps string options", () => {
    expect(normalizeQuestionOptions(["A", "B"])).toEqual([
      { key: "A", label: "A" },
      { key: "B", label: "B" },
    ]);
  });

  it("flattens {label, description} objects", () => {
    const opts = normalizeQuestionOptions([
      { label: "Fill brief", description: "Update research brief sections" },
      { label: "Start build", description: "Create exp-v4 now" },
    ]);
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({
      label: "Fill brief",
      description: "Update research brief sections",
    });
  });
});

describe("extractQuestionPrompt", () => {
  it("reads Prism flat { question, options, multiSelect }", () => {
    expect(
      extractQuestionPrompt({
        question: "Pick a path",
        options: ["A", "B"],
        multiSelect: true,
      }),
    ).toEqual({
      question: "Pick a path",
      options: [
        { key: "A", label: "A" },
        { key: "B", label: "B" },
      ],
      multiSelect: true,
    });
  });

  it("reads OpenCode nested questions[] (label+description options)", () => {
    const extracted = extractQuestionPrompt({
      questions: [
        {
          question: "Which dimensions should improvement cover?",
          header: "Scope",
          options: [
            { label: "Data only", description: "Fix data pipeline" },
            { label: "Methods", description: "Change evaluation" },
          ],
          multiple: true,
        },
      ],
    });
    expect(extracted.question).toBe("Which dimensions should improvement cover?");
    expect(extracted.multiSelect).toBe(true);
    expect(extracted.options).toHaveLength(2);
    expect(extracted.options[0]).toMatchObject({
      label: "Data only",
      description: "Fix data pipeline",
    });
  });

  it("falls back to header when question text is missing", () => {
    expect(
      extractQuestionPrompt({
        questions: [{ header: "Scope", options: ["A"] }],
      }).question,
    ).toBe("Scope");
  });

  it("prefers top-level question but fills options from nested when top-level options empty", () => {
    const extracted = extractQuestionPrompt({
      question: "Top-level question",
      options: [],
      questions: [
        {
          question: "Nested (ignored when top-level present)",
          options: [{ label: "From nested", description: "yes" }],
        },
      ],
    });
    expect(extracted.question).toBe("Top-level question");
    expect(extracted.options).toEqual([
      expect.objectContaining({ label: "From nested", description: "yes" }),
    ]);
  });

  it("reads choices alias and name on option objects", () => {
    expect(
      extractQuestionPrompt({
        question: "Pick",
        choices: ["A", "B"],
      }).options,
    ).toHaveLength(2);

    expect(
      extractQuestionPrompt({
        questions: [{ question: "Pick", options: [{ name: "Fast path" }] }],
      }).options[0]?.label,
    ).toBe("Fast path");
  });

  it("parses bullet options embedded in question prose", () => {
    const extracted = extractQuestionPrompt({
      question: "Which path?\n\n- Fill brief first\n- Start build now",
    });
    expect(extracted.question).toBe("Which path?");
    expect(extracted.options.map((o) => o.label)).toEqual([
      "Fill brief first",
      "Start build now",
    ]);
  });
});
