import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  BUILTIN_DEFAULT_PROJECT_DIRNAME,
  HOME_SETTINGS_FILENAME,
  PROJECT_META_DIR,
  projectSlotMetaRel,
} from "../../src/shared/workbench-paths";
import { resolveWorkbenchHome, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import {
  ensureDefaultProject,
  getWorkbenchState,
  resolveBuiltinDefaultProjectPath,
  setDefaultFromFolder,
  setDefaultProjectId,
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-default-"));
  temps.push(dir);
  return dir;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

describe("resolveBuiltinDefaultProjectPath", () => {
  it("joins the platform Documents directory with PrismNext", () => {
    const documentsDir = path.join(tmpRoot(), "Docs");
    const resolved = resolveBuiltinDefaultProjectPath({ documentsDir });
    expect(resolved.endsWith(`/${BUILTIN_DEFAULT_PROJECT_DIRNAME}`)).toBe(true);
    expect(resolved).toBe(
      path.resolve(documentsDir, BUILTIN_DEFAULT_PROJECT_DIRNAME).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });
});

describe("ensureDefaultProject", () => {
  it("creates the builtin folder, workbench.json, slot meta, and home settings", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const first = ensureDefaultProject({ homeDir: userHome, documentsDir });

    const projectRoot = path.join(documentsDir, BUILTIN_DEFAULT_PROJECT_DIRNAME);
    expect(first.lastPath).toBe(path.resolve(projectRoot).replace(/\\/g, "/").replace(/\/+$/, ""));
    expect(first.projectId.startsWith("p_")).toBe(true);

    const json = readWorkbenchJson(first.lastPath);
    expect(json?.id).toBe(first.projectId);
    expect(json && "lastPath" in json).toBe(false);

    const gitignore = fs.readFileSync(
      path.join(first.lastPath, PROJECT_META_DIR, ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toMatch(/compile\//);
    expect(gitignore).toMatch(/\.venv\//);
    expect(gitignore).toMatch(/interactions\//);
    expect(fs.existsSync(path.join(first.lastPath, PROJECT_META_DIR, "compile"))).toBe(true);
    expect(fs.readFileSync(path.join(first.lastPath, PROJECT_META_DIR, "agent", "AGENTS.md"), "utf-8")).toBe("");

    const home = resolveWorkbenchHome({ homeDir: userHome });
    const settings = readJson(path.join(home, HOME_SETTINGS_FILENAME)) as {
      defaultProjectId: string;
      workbenchProjectIds: string[];
    };
    expect(settings.defaultProjectId).toBe(first.projectId);
    expect(settings.workbenchProjectIds).toEqual([first.projectId]);

    const meta = readJson(path.join(home, projectSlotMetaRel(first.projectId))) as {
      lastPath: string;
    };
    expect(meta.lastPath).toBe(first.lastPath);

    const second = ensureDefaultProject({ homeDir: userHome, documentsDir });
    expect(second).toEqual(first);
  });

  it("does not adopt a leftover paper folder as the default", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const leftover = path.join(userHome, "old-paper");
    fs.mkdirSync(leftover, { recursive: true });

    const created = ensureDefaultProject({ homeDir: userHome, documentsDir });
    expect(created.lastPath).not.toBe(path.resolve(leftover).replace(/\\/g, "/").replace(/\/+$/, ""));
    expect(created.lastPath.endsWith(`/${BUILTIN_DEFAULT_PROJECT_DIRNAME}`)).toBe(true);
  });
});

describe("change default role (D-19)", () => {
  it("marks another folder as default without rebinding the old id", () => {
    const userHome = path.join(tmpRoot(), "Users", "me");
    const documentsDir = path.join(userHome, "Documents");
    const first = ensureDefaultProject({ homeDir: userHome, documentsDir });
    const other = path.join(tmpRoot(), "other-paper");
    fs.mkdirSync(other, { recursive: true });

    const next = setDefaultFromFolder(other, { homeDir: userHome, documentsDir });
    expect(next.projectId).not.toBe(first.projectId);
    expect(next.lastPath).toBe(path.resolve(other).replace(/\\/g, "/").replace(/\/+$/, ""));

    expect(readWorkbenchJson(first.lastPath)?.id).toBe(first.projectId);
    expect(readWorkbenchJson(next.lastPath)?.id).toBe(next.projectId);

    const state = getWorkbenchState({ homeDir: userHome, documentsDir });
    expect(state.defaultProjectId).toBe(next.projectId);
    expect(state.defaultLastPath).toBe(next.lastPath);
    expect(state.workbenchProjectIds).toEqual(expect.arrayContaining([first.projectId, next.projectId]));
    expect(state.workbenchProjectIds).toHaveLength(2);

    setDefaultProjectId(first.projectId, { homeDir: userHome, documentsDir });
    const back = getWorkbenchState({ homeDir: userHome, documentsDir });
    expect(back.defaultProjectId).toBe(first.projectId);
    expect(back.defaultLastPath).toBe(first.lastPath);
    expect(readWorkbenchJson(next.lastPath)?.id).toBe(next.projectId);
  });
});
