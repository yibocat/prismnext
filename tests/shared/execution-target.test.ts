import { describe, expect, it } from "vitest";
import {
  executionTargetFromPath,
  firstExecutionTarget,
} from "../../src/shared/remote/execution-target";

describe("executionTargetFromPath", () => {
  it("parses a remote:// URI", () => {
    expect(executionTargetFromPath("remote://lab/home/u/p")).toEqual({
      kind: "remote",
      profileId: "lab",
      abs: "/home/u/p",
      encoded: "remote://lab/home/u/p",
    });
  });

  it("recovers a collapsed remote:/ URI", () => {
    const target = executionTargetFromPath("remote:/lab/home/u/p");
    expect(target).toEqual({
      kind: "remote",
      profileId: "lab",
      abs: "/home/u/p",
      encoded: "remote://lab/home/u/p",
    });
  });

  it("treats a laptop absolute path as local", () => {
    expect(executionTargetFromPath("/Users/me/paper")).toEqual({
      kind: "local",
      root: "/Users/me/paper",
    });
  });

  it("returns null for empty values", () => {
    expect(executionTargetFromPath("")).toBeNull();
    expect(executionTargetFromPath("   ")).toBeNull();
    expect(executionTargetFromPath(null)).toBeNull();
    expect(executionTargetFromPath(undefined)).toBeNull();
  });
});

describe("firstExecutionTarget", () => {
  it("skips empty slots and returns the first real target", () => {
    expect(firstExecutionTarget(null, "", "remote://lab/tmp/x")).toEqual({
      kind: "remote",
      profileId: "lab",
      abs: "/tmp/x",
      encoded: "remote://lab/tmp/x",
    });
  });
});
