import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PROJECT_META_DIR, projectSlotMetaRel, worktreeCheckoutRel } from "../../src/shared/workbench/paths";
import { resolveWorkbenchHome, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import {
  ensureDefaultProject,
  getWorkbenchState,
  openWorkbenchFolder,
  removeWorkbenchProject,
  reorderWorkbenchProjects,
  setProjectDisplayName,
} from "../../src/main/workbench/default-project";
import { readWorkbenchJson } from "../../src/main/workbench/identity";

const temps: string[] = [];

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-member-"));
  temps.push(dir);
  return dir;
}

function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

function setupHome() {
  const userHome = path.join(tmpRoot(), "Users", "me");
  const documentsDir = path.join(userHome, "Documents");
  const def = ensureDefaultProject({ homeDir: userHome, documentsDir });
  return { userHome, documentsDir, def };
}

describe("openWorkbenchFolder — five steps persist", () => {
  it("1. empty folder mints an id, joins the workbench, and does not steal default", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "paper-a");
    fs.mkdirSync(paper, { recursive: true });

    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    expect(opened.projectId.startsWith("p_")).toBe(true);
    expect(opened.projectId).not.toBe(def.projectId);
    expect(opened.lastPath).toBe(norm(paper));
    expect(readWorkbenchJson(paper)?.id).toBe(opened.projectId);
    expect(readWorkbenchJson(paper) && "lastPath" in (readWorkbenchJson(paper) ?? {})).toBe(false);

    const state = getWorkbenchState({ homeDir: userHome, documentsDir });
    expect(state.defaultProjectId).toBe(def.projectId);
    expect(state.workbenchProjectIds).toEqual([def.projectId, opened.projectId]);
    expect(state.members.map((m) => m.id)).toEqual([def.projectId, opened.projectId]);
  });

  it("2. disk id without a home slot creates the slot and reuses that id", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "cloned");
    fs.mkdirSync(path.join(paper, PROJECT_META_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(paper, PROJECT_META_DIR, "workbench.json"),
      `${JSON.stringify({ id: "p_fromclone" }, null, 2)}\n`,
    );

    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    expect(opened.projectId).toBe("p_fromclone");
    const home = resolveWorkbenchHome({ homeDir: userHome });
    expect(fs.existsSync(path.join(home, projectSlotMetaRel("p_fromclone")))).toBe(true);
    expect(getWorkbenchState({ homeDir: userHome, documentsDir }).workbenchProjectIds)
      .toEqual([def.projectId, "p_fromclone"]);
  });

  it("3. opening the same folder again reuses the id", () => {
    const { userHome, documentsDir } = setupHome();
    const paper = path.join(tmpRoot(), "paper-a");
    fs.mkdirSync(paper, { recursive: true });
    const first = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    const second = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    expect(second.projectId).toBe(first.projectId);
    expect(getWorkbenchState({ homeDir: userHome, documentsDir }).workbenchProjectIds)
      .toHaveLength(2);
  });

  it("4. dead lastPath rebinds the same id to the new folder", () => {
    const { userHome, documentsDir } = setupHome();
    const original = path.join(tmpRoot(), "old-disk", "paper");
    fs.mkdirSync(original, { recursive: true });
    const first = openWorkbenchFolder(original, { homeDir: userHome, documentsDir });
    fs.rmSync(original, { recursive: true, force: true });

    const moved = path.join(tmpRoot(), "new-disk", "paper");
    fs.mkdirSync(moved, { recursive: true });
    fs.mkdirSync(path.join(moved, PROJECT_META_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(moved, PROJECT_META_DIR, "workbench.json"),
      `${JSON.stringify({ id: first.projectId }, null, 2)}\n`,
    );

    const rebound = openWorkbenchFolder(moved, { homeDir: userHome, documentsDir });
    expect(rebound.projectId).toBe(first.projectId);
    expect(rebound.lastPath).toBe(norm(moved));
  });

  it("5. a live copy of an already-open folder mints a new id", () => {
    const { userHome, documentsDir } = setupHome();
    const original = path.join(tmpRoot(), "paper-a");
    const copy = path.join(tmpRoot(), "paper-a-copy");
    fs.mkdirSync(original, { recursive: true });
    const first = openWorkbenchFolder(original, { homeDir: userHome, documentsDir });

    fs.mkdirSync(path.join(copy, PROJECT_META_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(copy, PROJECT_META_DIR, "workbench.json"),
      `${JSON.stringify({ id: first.projectId }, null, 2)}\n`,
    );

    const second = openWorkbenchFolder(copy, { homeDir: userHome, documentsDir });
    expect(second.projectId).not.toBe(first.projectId);
    expect(readWorkbenchJson(original)?.id).toBe(first.projectId);
    expect(readWorkbenchJson(copy)?.id).toBe(second.projectId);
  });
});

describe("setProjectDisplayName", () => {
  it("renames the workbench label and keeps it after reopening the folder", () => {
    const { userHome, documentsDir } = setupHome();
    const paper = path.join(tmpRoot(), "paper-rename");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });

    const renamed = setProjectDisplayName(opened.projectId, "  你好  ", {
      homeDir: userHome,
      documentsDir,
    });
    expect(renamed.members.find((m) => m.id === opened.projectId)?.displayName).toBe("你好");

    openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    expect(
      getWorkbenchState({ homeDir: userHome, documentsDir })
        .members.find((m) => m.id === opened.projectId)?.displayName,
    ).toBe("你好");
  });

  it("clears a custom name back to the folder basename", () => {
    const { userHome, documentsDir } = setupHome();
    const paper = path.join(tmpRoot(), "paper-clear");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    setProjectDisplayName(opened.projectId, "Custom", { homeDir: userHome, documentsDir });
    const cleared = setProjectDisplayName(opened.projectId, "   ", { homeDir: userHome, documentsDir });
    expect(cleared.members.find((m) => m.id === opened.projectId)?.displayName).toBe("paper-clear");
  });
});

describe("removeWorkbenchProject", () => {
  it("can remove the default project from the workbench without dropping the role", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "paper-keep");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    const opts = { homeDir: userHome, documentsDir };

    const after = removeWorkbenchProject(def.projectId, opts);
    expect(after.defaultProjectId).toBe(def.projectId);
    expect(after.defaultLastPath).toBe(def.lastPath);
    expect(after.workbenchProjectIds).toEqual([opened.projectId]);
    expect(after.members.map((m) => m.id)).toEqual([opened.projectId]);
    expect(getWorkbenchState(opts).workbenchProjectIds).toEqual([opened.projectId]);

    const rejoined = openWorkbenchFolder(def.lastPath, opts);
    expect(rejoined.projectId).toBe(def.projectId);
    expect(getWorkbenchState(opts).workbenchProjectIds).toEqual([opened.projectId, def.projectId]);
  });

  it("drops only the member list; the repo and home slot stay", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "paper-b");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });

    const after = removeWorkbenchProject(opened.projectId, { homeDir: userHome, documentsDir });
    expect(after.workbenchProjectIds).toEqual([def.projectId]);
    expect(after.members.map((m) => m.id)).toEqual([def.projectId]);
    expect(fs.existsSync(paper)).toBe(true);
    expect(readWorkbenchJson(paper)?.id).toBe(opened.projectId);
    const home = resolveWorkbenchHome({ homeDir: userHome });
    expect(fs.existsSync(path.join(home, projectSlotMetaRel(opened.projectId)))).toBe(true);

    const rejoined = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    expect(rejoined.projectId).toBe(opened.projectId);
  });

  it("opening a home worktree checkout remaps to the paper project, not a new row", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "paper-wt");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    const home = resolveWorkbenchHome({ homeDir: userHome });
    const checkout = path.join(home, worktreeCheckoutRel(opened.projectId, "calm-owl"));
    fs.mkdirSync(checkout, { recursive: true });

    const remapped = openWorkbenchFolder(checkout, { homeDir: userHome, documentsDir });
    expect(remapped.projectId).toBe(opened.projectId);
    expect(remapped.lastPath).toBe(norm(paper));
    expect(getWorkbenchState({ homeDir: userHome, documentsDir }).workbenchProjectIds)
      .toEqual([def.projectId, opened.projectId]);
  });

  it("reorders workbench projects including the default", () => {
    const { userHome, documentsDir, def } = setupHome();
    const paper = path.join(tmpRoot(), "paper-order");
    fs.mkdirSync(paper, { recursive: true });
    const opened = openWorkbenchFolder(paper, { homeDir: userHome, documentsDir });
    const opts = { homeDir: userHome, documentsDir };

    const next = reorderWorkbenchProjects([opened.projectId, def.projectId], opts);
    expect(next.workbenchProjectIds).toEqual([opened.projectId, def.projectId]);
    expect(next.members.map((m) => m.id)).toEqual([opened.projectId, def.projectId]);
    expect(next.defaultProjectId).toBe(def.projectId);
    expect(getWorkbenchState(opts).workbenchProjectIds).toEqual([opened.projectId, def.projectId]);

    expect(() => reorderWorkbenchProjects([opened.projectId], opts)).toThrow("workbench_order_mismatch");
  });
});
