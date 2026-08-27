import { describe, expect, it } from "vitest";
import {
  filterRemoteHostProjects,
  listRemoteHostProjects,
} from "../../src/renderer/lib/remote/host-projects";
import { workbenchMembersOnProfile } from "../../src/renderer/lib/remote/sync-actions";

describe("remote host project recents", () => {
  it("lists only this host's remote folders and prefers the workbench name", () => {
    const listed = listRemoteHostProjects(
      "lab",
      [
        { path: "/Users/me/local", name: "local" },
        { path: "remote://other/home/ubuntu/x", name: "x" },
        { path: "remote://lab/home/ubuntu/paper", name: "old-name" },
        { path: "remote://lab/home/ubuntu/notes", name: "notes" },
      ],
      [
        { lastPath: "remote://lab/home/ubuntu/paper", displayName: "My Paper" },
        { lastPath: "/Users/me/local", displayName: "local" },
      ],
    );
    expect(listed).toEqual([
      {
        lastPath: "remote://lab/home/ubuntu/paper",
        remoteRoot: "/home/ubuntu/paper",
        name: "My Paper",
      },
      {
        lastPath: "remote://lab/home/ubuntu/notes",
        remoteRoot: "/home/ubuntu/notes",
        name: "notes",
      },
    ]);
  });

  it("filters by name or remote path", () => {
    const items = listRemoteHostProjects(
      "lab",
      [{ path: "remote://lab/home/ubuntu/paper", name: "paper" }],
      [],
    );
    expect(filterRemoteHostProjects(items, "PAPER")).toEqual(items);
    expect(filterRemoteHostProjects(items, "/home/ubuntu")).toEqual(items);
    expect(filterRemoteHostProjects(items, "gpu")).toEqual([]);
  });
});

describe("workbenchMembersOnProfile", () => {
  it("keeps only members whose lastPath is on that host", () => {
    expect(workbenchMembersOnProfile(
      [
        { id: "p_a", lastPath: "remote://lab/home/u/a" },
        { id: "p_b", lastPath: "remote://gpu/home/u/b" },
        { id: "p_c", lastPath: "/Users/me/local" },
      ],
      "lab",
    )).toEqual([{ id: "p_a", lastPath: "remote://lab/home/u/a" }]);
  });
});
