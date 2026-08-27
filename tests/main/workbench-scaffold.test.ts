import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_META_DIR, projectCompileRel, workbenchJsonRel } from "../../src/shared/workbench/paths";
import {
  checkWorkbenchProject,
  createWorkbenchProjectOnDisk,
  ensureWorkbenchProjectMeta,
  projectMetaAbsIfLocal,
} from "../../src/main/workbench/scaffold";
import { readWorkbenchJson } from "../../src/main/workbench/identity";
import { readWorkspaceDirs } from "../../src/main/project/workspace-config";
import { DEFAULT_PROJECT_GITIGNORE } from "../../src/main/git/facade";
import { listPapers } from "../../src/main/literature/facade";
import { tempWorkbenchHome } from "./helpers/temp-literature-project";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "workbench-scaffold-"));
  temps.push(dir);
  return dir;
}

describe("createWorkbenchProjectOnDisk", () => {
  it("writes .workbench/workbench.json with id + workspace and never creates .prismnext", () => {
    const root = tmpProject();
    const result = createWorkbenchProjectOnDisk({ rootPath: root });

    expect(result.projectId.startsWith("p_")).toBe(true);
    expect(existsSync(join(root, workbenchJsonRel()))).toBe(true);
    expect(existsSync(join(root, PROJECT_META_DIR, "compile"))).toBe(true);
    expect(existsSync(join(root, ".prismnext"))).toBe(false);

    const json = readWorkbenchJson(root);
    expect(json?.id).toBe(result.projectId);
    expect(json?.workspace?.folders).toEqual([
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ]);
    expect(readWorkspaceDirs(root)).toEqual(json?.workspace?.folders);
    expect(existsSync(join(root, "manuscript", "main.tex"))).toBe(true);
  });

  it("rejects when workbench.json already exists, not when an old .prismnext folder is present", () => {
    const root = tmpProject();
    mkdirSync(join(root, ".prismnext"), { recursive: true });
    writeFileSync(join(root, ".prismnext", "settings.json"), "{}\n");

    const first = createWorkbenchProjectOnDisk({ rootPath: root });
    expect(first.projectId).toBeTruthy();
    expect(existsSync(join(root, ".prismnext", "settings.json"))).toBe(true);

    expect(() => createWorkbenchProjectOnDisk({ rootPath: root })).toThrow(/already exists/);
  });
});

describe("ensureWorkbenchProjectMeta", () => {
  it("scaffolds .workbench only and leaves a sibling .prismnext untouched", () => {
    const root = tmpProject();
    mkdirSync(join(root, ".prismnext", "library"), { recursive: true });
    writeFileSync(join(root, ".prismnext", "library", "library.db"), "");

    const ensured = ensureWorkbenchProjectMeta(root);
    expect(ensured.projectId.startsWith("p_")).toBe(true);
    expect(existsSync(join(root, workbenchJsonRel()))).toBe(true);
    expect(existsSync(join(root, projectCompileRel()))).toBe(true);
    expect(existsSync(join(root, ".prismnext", "library", "library.db"))).toBe(true);
    expect(existsSync(join(root, ".prismnext", "compile"))).toBe(false);
    expect(readWorkspaceDirs(root).some((d) => d.function === "manuscript")).toBe(true);
  });

  it("fills default folders and mkdir manuscript/ when workbench.json only has id", () => {
    const root = tmpProject();
    mkdirSync(join(root, PROJECT_META_DIR), { recursive: true });
    writeFileSync(join(root, workbenchJsonRel()), `${JSON.stringify({ id: "p_oldonly" }, null, 2)}\n`);

    ensureWorkbenchProjectMeta(root);
    expect(readWorkbenchJson(root)?.workspace?.folders).toEqual([
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ]);
    expect(existsSync(join(root, "manuscript"))).toBe(true);
  });
});

describe("checkWorkbenchProject", () => {
  it("reports missing .workbench/workbench.json, not .prismnext", () => {
    const root = tmpProject();
    expect(checkWorkbenchProject(root).missing).toContain(`${PROJECT_META_DIR}/workbench.json`);
    expect(checkWorkbenchProject(root).missing.join(" ")).not.toContain(".prismnext");

    ensureWorkbenchProjectMeta(root);
    expect(checkWorkbenchProject(root).missing).toEqual([]);
  });
});

describe("projectMetaAbsIfLocal", () => {
  it("refuses remote:// so template backups do not treat a Host path as a local folder", () => {
    expect(projectMetaAbsIfLocal("remote://lab/home/ubuntu/paper")).toBeNull();
  });
});

describe("DEFAULT_PROJECT_GITIGNORE", () => {
  it("ignores compile cache and leaves workbench.json trackable", () => {
    expect(DEFAULT_PROJECT_GITIGNORE).toContain(".workbench/compile/");
    expect(DEFAULT_PROJECT_GITIGNORE).toContain(".venv/");
    expect(DEFAULT_PROJECT_GITIGNORE).toContain(".workbench/experiments/");
    expect(DEFAULT_PROJECT_GITIGNORE).toMatch(/interactions\//);
    const lines = DEFAULT_PROJECT_GITIGNORE.split("\n");
    expect(lines).not.toContain(".prismnext/");
    expect(lines).not.toContain(".workbench/");
    expect(lines).not.toContain(".workbench/workbench.json");
    expect(lines).not.toContain("workbench.json");
  });
});

describe("literature list on a fresh workbench project", () => {
  it("does not mkdir .prismnext just to return an empty list", () => {
    tempWorkbenchHome();
    const root = tmpProject();
    createWorkbenchProjectOnDisk({ rootPath: root });
    expect(listPapers(root)).toEqual([]);
    expect(existsSync(join(root, ".prismnext"))).toBe(false);
  });
});
