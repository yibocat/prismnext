import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/compile.ts"), "utf8");
const host = readFileSync(join(__dirname, "../../src/host/compile-handlers.ts"), "utf8");

describe("remote compile IPC routing", () => {
  it("forwards execute and detect through domain-route", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("compile:execute");
    expect(ipc).not.toContain("compile:typstLive");
    expect(ipc).toContain("compile:typstExport");
    expect(ipc).toContain("compile:detectTexlive");
    expect(ipc).toContain('["projectDir"]');
    expect(ipc).toContain('["projectRoot"]');
    expect(ipc).not.toContain("useCurrentRoot");
    expect(host).toContain("compile:execute");
    expect(host).not.toContain("compile:typstLive");
    expect(host).toContain("compile:detectTexlive");
    expect(ipc).toContain("pdfBytes");
    expect(ipc).not.toContain("prismnext-remote-");
  });
});
