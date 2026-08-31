import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/execution.ts"), "utf8");

describe("remote execution IPC routing", () => {
  it("routes through domain-route with args keys before currentRoot (E1b)", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain('keys: ["projectRoot", "projectId"]');
    expect(ipc).toContain("useCurrentRoot: true");
  });
});
