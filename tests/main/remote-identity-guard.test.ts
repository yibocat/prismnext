import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbenchFolder } from "../../src/main/workbench/default-project";
import { writeWorkbenchJson } from "../../src/main/workbench/identity";
import { ensureWorkbenchProjectMeta } from "../../src/main/workbench/scaffold";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

const leaked = join(process.cwd(), "remote:");
const homes: string[] = [];

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  rmSync(leaked, { recursive: true, force: true });
  for (const dir of homes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("remote project roots are not local folders", () => {
  it("refuses to mkdir a remote:// URI under the current working directory", () => {
    expect(() => writeWorkbenchJson("remote://lab/home/ubuntu/paper", { id: "p_lab" })).toThrow(
      /remote_project_root_is_not_local/,
    );
    expect(() => ensureWorkbenchProjectMeta("remote://lab/home/ubuntu/paper")).toThrow(
      /remote_project_root_is_not_local/,
    );
    const home = mkdtempSync(join(tmpdir(), "remote-identity-"));
    homes.push(home);
    expect(() =>
      openWorkbenchFolder("remote://lab/home/ubuntu/paper", {
        homeDir: home,
        documentsDir: join(home, "Documents"),
      }),
    ).toThrow(/remote_project_root_is_not_local/);
    expect(existsSync(leaked)).toBe(false);
  });
});
