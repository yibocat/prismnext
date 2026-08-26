import { describe, expect, it } from "vitest";
import { projectHandleFromFocus } from "../../src/shared/remote";

describe("projectHandleFromFocus", () => {
  it("builds a remote handle from the focused workbench member", () => {
    const members = [
      { id: "p_local", lastPath: "/Users/me/paper" },
      { id: "p_lab", lastPath: "remote://lab/home/ubuntu/paper" },
    ];
    const focusId = "p_lab";
    const member = members.find((item) => item.id === focusId);
    expect(member).toBeTruthy();
    expect(projectHandleFromFocus({
      projectId: member!.id,
      lastPath: member!.lastPath,
      connectionId: "conn_1",
    })).toEqual({
      kind: "remote",
      projectId: "p_lab",
      profileId: "lab",
      remoteRoot: "/home/ubuntu/paper",
      connectionId: "conn_1",
    });
  });

  it("keeps a local handle for a laptop folder", () => {
    expect(projectHandleFromFocus({
      projectId: "p_local",
      lastPath: "/Users/me/paper",
    })).toEqual({
      kind: "local",
      projectId: "p_local",
      projectRoot: "/Users/me/paper",
    });
  });

  it("waits for a live connection id before minting a remote handle", () => {
    expect(projectHandleFromFocus({
      projectId: "p_lab",
      lastPath: "remote://lab/home/ubuntu/paper",
    })).toBeNull();
  });

  it("does not treat a path.resolve leftover as a local folder", () => {
    expect(projectHandleFromFocus({
      projectId: "p_lab",
      lastPath: "/Users/me/code/remote:/lab/home/ubuntu/paper",
    })).toBeNull();
    expect(projectHandleFromFocus({
      projectId: "p_lab",
      lastPath: "/Users/me/code/remote:/lab/home/ubuntu/paper",
      connectionId: "conn_1",
    })).toEqual({
      kind: "remote",
      projectId: "p_lab",
      profileId: "lab",
      remoteRoot: "/home/ubuntu/paper",
      connectionId: "conn_1",
    });
  });
});
