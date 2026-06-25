import { describe, expect, it } from "vitest";
import { isValidCommandName, promptTemplateForEdit } from "../../src/main/commands/template-utils";

describe("command template utils", () => {
  it("validates command names", () => {
    expect(isValidCommandName("review-section")).toBe(true);
    expect(isValidCommandName("Review")).toBe(false);
  });

  it("returns prompt body from legacy shell-first templates", () => {
    expect(promptTemplateForEdit("!`git status`\n\nSummarize output.")).toBe(
      "Summarize output.",
    );
  });

  it("returns plain prompt templates unchanged", () => {
    expect(promptTemplateForEdit("Review $ARGUMENTS")).toBe("Review $ARGUMENTS");
  });
});
