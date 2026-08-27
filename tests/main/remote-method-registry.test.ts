import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listRegisteredHostMethods } from "../../src/host/handler-registry";

const root = join(__dirname, "../..");

function ipcSource(name: string): string {
  return readFileSync(join(root, "src/main/ipc", name), "utf8");
}

/** Spec §11 rows that this line has closed. Later phases append here. */
const ROUTED = [
  { method: "compile:execute", ipc: "compile.ts" },
  { method: "compile:detectTexlive", ipc: "compile.ts" },
  { method: "terminal:loadConfig", ipc: "terminal.ts" },
  { method: "terminal:saveConfig", ipc: "terminal.ts" },
  { method: "project:create", ipc: "project-scaffold.ts" },
  { method: "project:check", ipc: "project-scaffold.ts" },
  { method: "project:ensure", ipc: "project-scaffold.ts" },
  { method: "project:scaffoldAgentsMd", ipc: "project-scaffold.ts" },
  { method: "workspace:getConfig", ipc: "workspace.ts" },
  { method: "workspace:updateConfig", ipc: "workspace.ts" },
  { method: "workspace:createFolders", ipc: "workspace.ts" },
  { method: "workspace:ensureMainTex", ipc: "workspace.ts" },
] as const;

describe("remote method registry", () => {
  it("routes listed methods through domain-route", () => {
    for (const row of ROUTED) {
      const src = ipcSource(row.ipc);
      expect(src, `${row.ipc} should call routeHostDomainMethod`).toContain("routeHostDomainMethod");
      expect(src, `${row.ipc} should name ${row.method}`).toContain(row.method);
    }
  });

  it("registers those methods on the Host", () => {
    const methods = listRegisteredHostMethods();
    for (const row of ROUTED) {
      expect(methods, `Host missing ${row.method}`).toContain(row.method);
    }
  });
});
