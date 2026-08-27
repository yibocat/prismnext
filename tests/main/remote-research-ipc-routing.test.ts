import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/research-plan.ts"), "utf8");
const registry = readFileSync(join(__dirname, "../../src/host/handler-registry.ts"), "utf8");

describe("remote research plan IPC routing", () => {
  it("forwards plan draft methods to the Host", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("researchPlan:claimDraft");
    expect(ipc).toContain("researchPlan:readDraft");
    expect(ipc).toContain("researchPlan:promoteDraft");
    expect(registry).toContain("researchHandlers");
  });
});
