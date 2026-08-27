import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decideRemoteWorkbenchIdentity,
  openWorkbenchFolder,
  registerRemoteWorkbenchProject,
} from "../../src/main/workbench/default-project";
import { writeWorkbenchJson } from "../../src/main/workbench/identity";

const homes: string[] = [];

afterEach(() => {
  for (const dir of homes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "remote-open-id-"));
  homes.push(home);
  return home;
}

describe("decideRemoteWorkbenchIdentity", () => {
  it("mints instead of stealing a live local member with the same workbench.json id", () => {
    const home = tmpHome();
    const documentsDir = join(home, "Documents");
    const local = join(documentsDir, "test1");
    mkdirSync(local, { recursive: true });
    writeWorkbenchJson(local, { id: "p_shared" });
    const opened = openWorkbenchFolder(local, { homeDir: home, documentsDir });
    expect(opened.projectId).toBe("p_shared");

    const decision = decideRemoteWorkbenchIdentity(
      { projectId: "p_shared", lastPath: "remote://lab/home/ubuntu/test1" },
      { homeDir: home, documentsDir },
    );
    expect(decision.action).toBe("mint");
    if (decision.action === "mint") {
      expect(decision.reason).toBe("second-live-copy");
      expect(decision.previousId).toBe("p_shared");
      expect(decision.id).not.toBe("p_shared");
    }

    expect(() =>
      registerRemoteWorkbenchProject(
        { projectId: "p_shared", lastPath: "remote://lab/home/ubuntu/test1" },
        { homeDir: home, documentsDir },
      ),
    ).toThrow(/remote_id_conflicts_with_live_member/);
  });

  it("reuses when the remote folder is already the member lastPath", () => {
    const home = tmpHome();
    registerRemoteWorkbenchProject(
      { projectId: "p_remote", lastPath: "remote://lab/home/ubuntu/test1" },
      { homeDir: home },
    );
    expect(decideRemoteWorkbenchIdentity(
      { projectId: "p_remote", lastPath: "remote://lab/home/ubuntu/test1" },
      { homeDir: home },
    )).toEqual({ action: "reuse", id: "p_remote" });
  });
});

describe("remote:openProject identity wiring", () => {
  it("adopts a minted id on the Host before registering the laptop member", () => {
    const ipc = readFileSync(join(__dirname, "../../src/main/ipc/remote.ts"), "utf8");
    const host = readFileSync(join(__dirname, "../../src/host/project-handlers.ts"), "utf8");
    expect(ipc).toContain("decideRemoteWorkbenchIdentity");
    expect(ipc).toContain("second-live-copy");
    expect(ipc).toContain("adoptId");
    expect(host).toContain("adoptId");
  });
});
