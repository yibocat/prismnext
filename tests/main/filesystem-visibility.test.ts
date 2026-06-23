import { describe, expect, it } from "vitest";
import {
  getProjectFileType,
  shouldSkipProjectDirectory,
  HIDDEN_DIRECTORY_NAMES,
} from "../../src/main/services/filesystem";

describe("filesystem visibility", () => {
  it("hides only internal and dependency directories", () => {
    expect(HIDDEN_DIRECTORY_NAMES.has(".git")).toBe(true);
    expect(HIDDEN_DIRECTORY_NAMES.has(".prismnext")).toBe(true);
    expect(shouldSkipProjectDirectory(".github")).toBe(false);
    expect(shouldSkipProjectDirectory(".vscode")).toBe(false);
    expect(shouldSkipProjectDirectory("manuscript")).toBe(false);
  });

  it("shows common dotfiles except system junk", () => {
    expect(getProjectFileType(".gitignore")).toBe("other");
    expect(getProjectFileType(".env")).toBe("other");
    expect(getProjectFileType(".editorconfig")).toBe("other");
    expect(getProjectFileType(".DS_Store")).toBeNull();
    expect(getProjectFileType("Thumbs.db")).toBeNull();
  });

  it("still hides LaTeX build artifacts", () => {
    expect(getProjectFileType("main.aux")).toBeNull();
    expect(getProjectFileType("main.log")).toBeNull();
  });
});
