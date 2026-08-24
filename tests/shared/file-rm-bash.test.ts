import { describe, expect, it } from "vitest";
import { isFileRmBashCommand, fileRmBashBlockMessage } from "../../src/shared/permissions/file-rm-bash";

describe("isFileRmBashCommand", () => {
  it("blocks file rm / unlink", () => {
    expect(isFileRmBashCommand("rm figures/old.png")).toBe(true);
    expect(isFileRmBashCommand("rm -f dest.jpg")).toBe(true);
    expect(isFileRmBashCommand("unlink tmp.out")).toBe(true);
    expect(isFileRmBashCommand("cd figures && rm cell.png")).toBe(true);
  });

  it("leaves recursive rm to the permission prompt", () => {
    expect(isFileRmBashCommand("rm -rf build")).toBe(false);
    expect(isFileRmBashCommand("rm -r out/")).toBe(false);
  });

  it("ignores mention-only", () => {
    expect(isFileRmBashCommand("echo rm file")).toBe(false);
    expect(isFileRmBashCommand("git status")).toBe(false);
  });

  it("points at the delete tool", () => {
    expect(fileRmBashBlockMessage()).toContain("delete");
  });
});
