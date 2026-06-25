import { describe, expect, it } from "vitest";
import {
  prepareDiffContents,
  trimLinesForWsDiff,
} from "../../src/renderer/lib/git/diff-display";

describe("git diff display helpers", () => {
  it("trimLinesForWsDiff removes trailing spaces per line", () => {
    expect(trimLinesForWsDiff("a  \nb\t\n")).toBe("a\nb\n");
  });

  it("prepareDiffContents leaves content when ignoreWhitespace is off", () => {
    expect(prepareDiffContents("a  ", "b", false)).toEqual({
      oldContent: "a  ",
      newContent: "b",
    });
  });

  it("prepareDiffContents trims when ignoreWhitespace is on", () => {
    expect(prepareDiffContents("a  ", "b  ", true)).toEqual({
      oldContent: "a",
      newContent: "b",
    });
  });
});
