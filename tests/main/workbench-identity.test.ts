import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PROJECT_META_DIR, WORKBENCH_JSON_FILENAME } from "../../src/shared/workbench-paths";
import {
  mintProjectId,
  readWorkbenchJson,
  resolveOpenFolder,
  writeWorkbenchJson,
} from "../../src/main/workbench/identity";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-id-"));
  temps.push(dir);
  return dir;
}

describe("mintProjectId", () => {
  it("returns a filesystem-safe p_ token that is not derived from a path", () => {
    const id = mintProjectId();
    expect(id).toMatch(/^p_[0-9a-f]+$/);
    expect(id.length).toBeGreaterThan(4);
    expect(id).not.toMatch(/[\\/:*?"<>|]/);
    expect(mintProjectId()).not.toBe(id);
  });
});

describe("readWorkbenchJson / writeWorkbenchJson", () => {
  it("round-trips id and workspace and never persists lastPath", () => {
    const project = path.join(tmpRoot(), "paper");
    writeWorkbenchJson(project, {
      id: "p_abc123",
      workspace: { folders: [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }] },
      lastPath: "/should/not/be/written",
    } as { id: string; workspace: { folders: Array<{ function: string; name: string; mainTex: string }> } });

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(project, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME), "utf-8"),
    ) as Record<string, unknown>;
    expect(onDisk.id).toBe("p_abc123");
    expect(onDisk).not.toHaveProperty("lastPath");
    expect(onDisk.workspace).toEqual({
      folders: [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }],
    });

    const read = readWorkbenchJson(project);
    expect(read?.id).toBe("p_abc123");
    expect(read).not.toHaveProperty("lastPath");
  });

  it("returns null when the file is missing or has no id", () => {
    const project = path.join(tmpRoot(), "empty");
    expect(readWorkbenchJson(project)).toBeNull();
    fs.mkdirSync(path.join(project, PROJECT_META_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(project, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME),
      JSON.stringify({ workspace: {} }),
      "utf-8",
    );
    expect(readWorkbenchJson(project)).toBeNull();
  });

  it("ignores a lastPath field that already exists on disk", () => {
    const project = path.join(tmpRoot(), "legacy");
    fs.mkdirSync(path.join(project, PROJECT_META_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(project, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME),
      JSON.stringify({ id: "p_keep", lastPath: "/old", workspace: { folders: [] } }),
      "utf-8",
    );
    const read = readWorkbenchJson(project);
    expect(read).toEqual({ id: "p_keep", workspace: { folders: [] } });
  });
});

describe("resolveOpenFolder — five steps", () => {
  const here = "/Users/me/Documents/paper-a";
  const other = "/Users/me/Documents/paper-a-copy";

  it("1. no workbench.json → mint a new id", () => {
    const decision = resolveOpenFolder({
      absPath: here,
      workbenchId: null,
      slots: [],
      livePaths: [here],
      mintId: () => "p_new1",
    });
    expect(decision).toEqual({ action: "mint", id: "p_new1", reason: "no-json" });
  });

  it("2. has id, no slot → create the home slot", () => {
    const decision = resolveOpenFolder({
      absPath: here,
      workbenchId: "p_fromclone",
      slots: [],
      livePaths: [here],
    });
    expect(decision).toEqual({ action: "create-slot", id: "p_fromclone" });
  });

  it("3. slot lastPath is this folder → reuse", () => {
    const decision = resolveOpenFolder({
      absPath: `${here}/`,
      workbenchId: "p_same",
      slots: [{ id: "p_same", lastPath: here }],
      livePaths: [here],
    });
    expect(decision).toEqual({ action: "reuse", id: "p_same" });
  });

  it("4. slot lastPath is dead → rebind, keep id", () => {
    const decision = resolveOpenFolder({
      absPath: here,
      workbenchId: "p_moved",
      slots: [{ id: "p_moved", lastPath: "/Volumes/old-disk/paper" }],
      livePaths: [here],
    });
    expect(decision).toEqual({ action: "rebind", id: "p_moved" });
  });

  it("5. slot lastPath is another live folder → mint a new id for this copy", () => {
    const decision = resolveOpenFolder({
      absPath: other,
      workbenchId: "p_original",
      slots: [{ id: "p_original", lastPath: here }],
      livePaths: [here, other],
      mintId: () => "p_copy",
    });
    expect(decision).toEqual({
      action: "mint",
      id: "p_copy",
      reason: "second-live-copy",
      previousId: "p_original",
    });
  });
});
