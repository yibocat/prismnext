import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/teams.ts"), "utf8");

function handlerBody(method: string): string {
  const token = `"${method}"`;
  let start = 0;
  while (start < ipc.length) {
    const idx = ipc.indexOf(token, start);
    expect(idx).toBeGreaterThan(-1);
    const after = ipc[idx + token.length] ?? "";
    if (/[A-Za-z]/.test(after)) {
      start = idx + token.length;
      continue;
    }
    const next = ipc.indexOf("ipcMain.handle(", idx + 1);
    return next === -1 ? ipc.slice(idx) : ipc.slice(idx, next);
  }
  throw new Error(`handler not found: ${method}`);
}

describe("remote teams IPC routing", () => {
  it("keeps the picker catalog on this computer", () => {
    for (const method of ["teams:list", "teams:get", "teams:listAssets", "teams:getRoster"]) {
      expect(handlerBody(method)).not.toContain("routeTeamsIfRemote");
    }
  });

  it("records the remote active team via Host fs, not Host catalog", () => {
    expect(handlerBody("teams:getActiveTeam")).toContain("readRemoteProjectDefaultTeam");
    expect(handlerBody("teams:getActiveTeam")).not.toContain("routeTeamsIfRemote");
    expect(handlerBody("teams:setActiveTeam")).toContain("writeRemoteProjectDefaultTeam");
    expect(handlerBody("teams:setActiveTeam")).not.toContain("routeTeamsIfRemote");
    expect(handlerBody("teams:setDefaultOrchestrator")).toContain("writeRemoteProjectDefaultTeam");
    expect(handlerBody("teams:setDefaultOrchestrator")).not.toContain("routeTeamsIfRemote");
    expect(handlerBody("teams:create")).toContain('routeTeamsIfRemote("teams:create"');
  });

  it("does not give the Host its own install / enable catalog", () => {
    for (const method of ["teams:install", "teams:uninstall", "teams:setEnabled", "teams:setAssetEnabled"]) {
      expect(handlerBody(method)).not.toContain("routeTeamsIfRemote");
    }
  });
});
