import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/terminal.ts"), "utf8");
const host = readFileSync(join(__dirname, "../../src/host/terminal-handlers.ts"), "utf8");

describe("remote terminal config IPC routing", () => {
  it("forwards load/save config to the Host and keeps PTY create on the existing path", () => {
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain("terminal:loadConfig");
    expect(ipc).toContain("terminal:saveConfig");
    expect(ipc).toContain('keys: ["projectRoot"]');
    expect(host).toContain("terminal:loadConfig");
    expect(host).toContain("terminal:saveConfig");
    expect(host).toContain("loadConfig");
    expect(host).toContain("saveConfig");
  });
});
