import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readWorkspaceDirs,
  writeWorkspaceDirs,
  validateWorkspaceDirs,
  ensureMainTex,
} from "../../src/main/project/workspace-config";
import { findManuscriptConfig } from "../../src/shared/workbench/workspace-folder";
import { readWorkbenchJson, writeWorkbenchJson } from "../../src/main/workbench/identity";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-workspace-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("workspace-config — readConfig", () => {
  it("returns default when workbench.json does not exist", () => {
    const result = readWorkspaceDirs(tmpDir);
    expect(result).toEqual([
      { function: "manuscript", name: "manuscript", mainFile: "main.tex", mainTex: "main.tex" },
    ]);
  });

  it("returns workspace folders from workbench.json when present and non-empty", () => {
    writeWorkbenchJson(tmpDir, {
      id: "p_test",
      workspace: {
        folders: [
          { function: "manuscript", name: "paper", mainTex: "article.tex" },
          { function: "literature", name: "lit" },
        ],
      },
    });

    const result = readWorkspaceDirs(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ function: "manuscript", name: "paper" });
    expect(result[1]).toMatchObject({ function: "literature", name: "lit" });
  });

  it("recovers default instead of returning [] when folders is empty (data-loss guard)", () => {
    writeWorkbenchJson(tmpDir, {
      id: "p_test",
      workspace: { folders: [] },
    });

    const result = readWorkspaceDirs(tmpDir);
    expect(result).not.toEqual([]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((d) => d.function === "manuscript")).toBe(true);
  });
});

describe("workspace-config — writeConfig", () => {
  it("writes workspace folders to workbench.json", () => {
    writeWorkbenchJson(tmpDir, { id: "p_test" });

    writeWorkspaceDirs(tmpDir, [
      { function: "manuscript", name: "paper", mainTex: "main.tex" },
    ]);

    const written = readWorkbenchJson(tmpDir);
    expect(written?.id).toBe("p_test");
    expect(written?.workspace?.folders).toHaveLength(1);
    expect(written?.workspace?.folders?.[0]).toMatchObject({ name: "paper" });
  });

  it("refuses to write an empty folder list (data-loss backstop)", () => {
    writeWorkbenchJson(tmpDir, {
      id: "p_test",
      workspace: {
        folders: [{ function: "manuscript", name: "paper", mainTex: "main.tex" }],
      },
    });

    writeWorkspaceDirs(tmpDir, []);

    const written = readWorkbenchJson(tmpDir);
    expect(written?.workspace?.folders).not.toEqual([]);
    expect(written?.workspace?.folders?.length).toBeGreaterThanOrEqual(1);
  });
});

describe("workspace-config — validate", () => {
  it("rejects duplicate names", () => {
    const dirs = [
      { function: "manuscript" as const, name: "src", mainTex: "main.tex" },
      { function: "experiment" as const, name: "src" },
    ];
    const errors = validateWorkspaceDirs(dirs);
    expect(errors).toContain('Duplicate folder name: "src"');
  });

  it("rejects multiple manuscript entries", () => {
    const dirs = [
      { function: "manuscript" as const, name: "paper1", mainTex: "main.tex" },
      { function: "manuscript" as const, name: "paper2", mainTex: "main.tex" },
    ];
    const errors = validateWorkspaceDirs(dirs);
    expect(errors.some((e) => e.includes("Only one manuscript"))).toBe(true);
  });

  it("accepts valid config", () => {
    const dirs = [
      { function: "manuscript" as const, name: "paper", mainTex: "main.tex" },
      { function: "literature" as const, name: "lit" },
      { function: "custom" as const, name: "scripts", customLabel: "脚本" },
    ];
    const errors = validateWorkspaceDirs(dirs);
    expect(errors).toHaveLength(0);
  });

  it("accepts a manuscript folder without a main-file pin", () => {
    const errors = validateWorkspaceDirs([
      { function: "manuscript" as const, name: "paper" },
    ]);
    expect(errors).toHaveLength(0);
  });

  it("rejects empty list (requires at least one folder - data-loss guard)", () => {
    const errors = validateWorkspaceDirs([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("manuscript pin", () => {
  it("treats legacy mainTex as mainFile", () => {
    expect(
      findManuscriptConfig([
        { function: "manuscript", name: "paper", mainTex: "article.tex" },
      ]),
    ).toEqual({ dir: "paper", mainFile: "article.tex" });
  });

  it("prefers mainFile over mainTex", () => {
    expect(
      findManuscriptConfig([
        { function: "manuscript", name: "paper", mainFile: "main.typ", mainTex: "main.tex" },
      ]),
    ).toEqual({ dir: "paper", mainFile: "main.typ" });
  });

  it("returns a config when the manuscript folder has no pin", () => {
    expect(findManuscriptConfig([{ function: "manuscript", name: "paper" }])).toEqual({
      dir: "paper",
      mainFile: undefined,
    });
  });

  it("dual-writes mainFile when persisting a mainTex-only folder", () => {
    writeWorkspaceDirs(tmpDir, [
      { function: "manuscript", name: "paper", mainTex: "article.tex" },
    ]);
    expect(readWorkbenchJson(tmpDir)?.workspace?.folders?.[0]).toMatchObject({
      name: "paper",
      mainFile: "article.tex",
      mainTex: "article.tex",
    });
  });

  it("ensureMainTex does not create a file when there is no pin", () => {
    writeWorkspaceDirs(tmpDir, [{ function: "manuscript", name: "paper" }]);
    fs.mkdirSync(path.join(tmpDir, "paper"), { recursive: true });
    expect(ensureMainTex(tmpDir)).toEqual({ created: false });
    expect(fs.existsSync(path.join(tmpDir, "paper", "main.tex"))).toBe(false);
  });

  it("ensureMainTex creates the pinned LaTeX file when missing", () => {
    writeWorkspaceDirs(tmpDir, [
      { function: "manuscript", name: "paper", mainFile: "article.tex" },
    ]);
    const result = ensureMainTex(tmpDir);
    expect(result.created).toBe(true);
    expect(result.relativePath).toBe("paper/article.tex");
    expect(fs.existsSync(path.join(tmpDir, "paper", "article.tex"))).toBe(true);
  });

  it("ensureMainTex does not scaffold a .typ pin", () => {
    writeWorkspaceDirs(tmpDir, [
      { function: "manuscript", name: "paper", mainFile: "main.typ" },
    ]);
    expect(ensureMainTex(tmpDir)).toEqual({ created: false });
    expect(fs.existsSync(path.join(tmpDir, "paper", "main.typ"))).toBe(false);
  });
});
