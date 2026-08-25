import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeWorkbenchJson } from "../../src/main/workbench/identity";

describe("remote project roots are not local folders", () => {
  it("refuses to mkdir a remote:// URI under the current working directory", () => {
    expect(() => writeWorkbenchJson("remote://lab/home/ubuntu/paper", { id: "p_lab" })).toThrow(
      /remote_project_root_is_not_local/,
    );
    expect(existsSync(join(process.cwd(), "remote:"))).toBe(false);
  });
});
