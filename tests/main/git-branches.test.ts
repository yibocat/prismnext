import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBranches } from "../../src/main/git/branch";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getBranches", () => {
  it("returns empty data for a folder that is not a git repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-nongit-"));
    dirs.push(dir);
    await expect(getBranches(dir)).resolves.toEqual({ current: "", branches: [] });
  });
});
