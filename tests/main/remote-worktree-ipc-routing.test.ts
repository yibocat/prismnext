import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWorktreeResult } from "../../src/main/ipc/worktree";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/worktree.ts"), "utf8");
const registry = readFileSync(join(__dirname, "../../src/host/handler-registry.ts"), "utf8");

describe("remote worktree IPC routing", () => {
  it("forwards worktree methods to the Host", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("worktree:create");
    expect(ipc).toContain("worktree:list");
    expect(ipc).toContain("worktree:remove");
    expect(registry).toContain("worktreeHandlers");
  });

  it("encodes Host checkout paths as remote:// so the renderer does not treat them as laptop folders", () => {
    const encoded = encodeWorktreeResult(
      "remote://lab/home/ubuntu/paper",
      {
        name: "calm-owl",
        path: "/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
        branch: "wt-calm-owl",
        baseBranch: "main",
        head: "abc123",
        aheadCount: 0,
        behindCount: 0,
      },
    );
    expect(encoded).toMatchObject({
      name: "calm-owl",
      path: "remote://lab/home/ubuntu/.prismnext/projects/p_ab/worktrees/calm-owl/checkout",
    });
  });
});
