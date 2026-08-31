import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("host remote permissions", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("persists allow-always lists on the Host", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-perm-"));
    setWorkbenchUserHomeOverride(home);
    const ctx = createHostContext();
    await dispatchHostMethod("settings:setRemotePermissions", {
      toolAllowAlways: ["read"],
      bashAllowAlwaysPatterns: ["git status*"],
    }, ctx);
    const got = await dispatchHostMethod("settings:getRemotePermissions", {}, ctx) as {
      toolAllowAlways?: string[];
      storedOn?: string;
    };
    expect(got.toolAllowAlways).toEqual(["read"]);
    expect(got.storedOn).toBe("server");
  });
});
