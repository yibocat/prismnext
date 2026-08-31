import { describe, expect, it } from "vitest";
import { newProjectRoot } from "../../src/renderer/lib/project/new-project-location";

describe("newProjectRoot", () => {
  it("joins a local parent and name", () => {
    expect(newProjectRoot({ kind: "local", parentPath: "/Users/me/papers" }, "thesis")).toBe(
      "/Users/me/papers/thesis",
    );
  });

  it("encodes a remote parent as remote://", () => {
    expect(newProjectRoot(
      { kind: "remote", profileId: "lab", parentPosix: "/home/u" },
      "paper",
    )).toBe("remote://lab/home/u/paper");
  });

  it("places a project at the remote root", () => {
    expect(newProjectRoot(
      { kind: "remote", profileId: "lab", parentPosix: "/" },
      "paper",
    )).toBe("remote://lab/paper");
  });

  it("rejects empty or path-like names", () => {
    expect(newProjectRoot({ kind: "local", parentPath: "/tmp" }, "")).toBeNull();
    expect(newProjectRoot({ kind: "local", parentPath: "/tmp" }, "a/b")).toBeNull();
    expect(newProjectRoot({ kind: "remote", profileId: "lab", parentPosix: "/home" }, "x\\y")).toBeNull();
  });

  it("rejects a missing parent", () => {
    expect(newProjectRoot({ kind: "local", parentPath: "" }, "paper")).toBeNull();
    expect(newProjectRoot({ kind: "remote", profileId: "lab", parentPosix: "" }, "paper")).toBeNull();
  });
});
