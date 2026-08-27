import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/interaction.ts"), "utf8");
const registry = readFileSync(join(__dirname, "../../src/host/handler-registry.ts"), "utf8");
const frames = readFileSync(join(__dirname, "../../src/host/serve-frames.ts"), "utf8");

describe("remote interaction IPC routing", () => {
  it("forwards interaction get/list/write to the Host", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("interaction:get");
    expect(ipc).toContain("interaction:list");
    expect(ipc).toContain("interaction:write");
    expect(registry).toContain("interactionHandlers");
  });

  it("pipes Host broadcasts (interaction-open) through the control-plane emit", () => {
    expect(frames).toContain("setHostEvents");
  });
});
