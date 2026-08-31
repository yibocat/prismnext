import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/git.ts"), "utf8");
const registry = readFileSync(join(__dirname, "../../src/host/handler-registry.ts"), "utf8");

describe("remote git IPC routing", () => {
  it("forwards git panel methods to the Host", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("git:status");
    expect(ipc).toContain("git:isRepo");
    expect(registry).toContain("gitHandlers");
  });
});
