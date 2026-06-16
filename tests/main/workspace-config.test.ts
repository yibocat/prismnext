import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readWorkspaceDirs,
  writeWorkspaceDirs,
  validateWorkspaceDirs,
} from "../../src/main/services/workspace-config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-workspace-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makePrismDir(root: string) {
  const prismDir = path.join(root, ".prismnext");
  fs.mkdirSync(prismDir, { recursive: true });
  return prismDir;
}

function writeSettings(prismDir: string, content: object) {
  fs.writeFileSync(
    path.join(prismDir, "settings.json"),
    JSON.stringify(content, null, 2),
  );
}

function readSettings(prismDir: string): any {
  return JSON.parse(fs.readFileSync(path.join(prismDir, "settings.json"), "utf-8"));
}

describe("workspace-config — readConfig", () => {
  it("returns default when settings.json does not exist", () => {
    const prismDir = makePrismDir(tmpDir);
    fs.rmSync(path.join(prismDir, "settings.json"), { force: true });

    const result = readWorkspaceDirs(prismDir);
    expect(result).toEqual([
      { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
    ]);
  });

  it("returns workspaceDirs when present and non-empty", () => {
    const prismDir = makePrismDir(tmpDir);
    writeSettings(prismDir, {
      version: 1,
      compiler: "tectonic",
      workspaceDirs: [
        { function: "manuscript", name: "paper", mainTex: "article.tex" },
        { function: "literature", name: "lit" },
      ],
    });

    const result = readWorkspaceDirs(prismDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ function: "manuscript", name: "paper" });
    expect(result[1]).toMatchObject({ function: "literature", name: "lit" });
  });

  it("returns empty array when workspaceDirs is explicitly empty", () => {
    const prismDir = makePrismDir(tmpDir);
    writeSettings(prismDir, {
      version: 1,
      compiler: "tectonic",
      workspaceDirs: [],
    });

    const result = readWorkspaceDirs(prismDir);
    expect(result).toEqual([]);
  });
});

describe("workspace-config — writeConfig", () => {
  it("writes workspaceDirs to settings.json", () => {
    const prismDir = makePrismDir(tmpDir);
    writeSettings(prismDir, {
      version: 1,
      compiler: "tectonic",
    });

    writeWorkspaceDirs(prismDir, [
      { function: "manuscript", name: "paper", mainTex: "main.tex" },
    ]);

    const written = readSettings(prismDir);
    expect(written.workspaceDirs).toHaveLength(1);
    expect(written.workspaceDirs[0].name).toBe("paper");
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

  it("accepts empty list", () => {
    const errors = validateWorkspaceDirs([]);
    expect(errors).toHaveLength(0);
  });
});
