import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjectRelByBasename } from "../../src/main/lib/find-project-file";

describe("findProjectRelByBasename", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("finds a file under an arbitrary project subdirectory", () => {
    root = mkdtempSync(join(tmpdir(), "prism-find-"));
    mkdirSync(join(root, "analysis", "v2"), { recursive: true });
    writeFileSync(join(root, "analysis", "v2", "chart.png"), "x");
    expect(findProjectRelByBasename(root, "chart.png")).toBe("analysis/v2/chart.png");
  });

  it("skips .venv / node_modules", () => {
    root = mkdtempSync(join(tmpdir(), "prism-find-skip-"));
    mkdirSync(join(root, ".venv", "lib"), { recursive: true });
    writeFileSync(join(root, ".venv", "lib", "hidden.png"), "x");
    mkdirSync(join(root, "ok"), { recursive: true });
    writeFileSync(join(root, "ok", "hidden.png"), "y");
    expect(findProjectRelByBasename(root, "hidden.png")).toBe("ok/hidden.png");
  });

  it("prefers newest mtime when multiple basenames match", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-find-mtime-"));
    mkdirSync(join(root, "old"), { recursive: true });
    mkdirSync(join(root, "new"), { recursive: true });
    writeFileSync(join(root, "old", "chart.png"), "old");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(join(root, "new", "chart.png"), "new");
    expect(findProjectRelByBasename(root, "chart.png")).toBe("new/chart.png");
  });
});
