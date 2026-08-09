import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { registerExternalPackRoot, unregisterExternalPackRoot } from "../../src/main/services/pack-catalog";
import { getPackMcpDefs } from "../../src/main/services/pack-catalog";
import { packMcpDefToAcp } from "../../src/main/acp/mcp-transform";
import { setPacksInstalledDataDir, addInstalledPack } from "../../src/main/services/packs-installed";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";
import { listProjectMcps } from "../../src/main/services/pack-resolver";
import { setPackEnabled } from "../../src/main/services/packs-state";
import { baseManifest, makePack } from "./packs-test-utils";

const roots: string[] = [];
const tempDirs: string[] = [];
function reg(dir: string) {
  registerExternalPackRoot(dir);
  roots.push(dir);
}
function temp(): string {
  const d = makeTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  for (const r of roots) unregisterExternalPackRoot(r);
  roots.length = 0;
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setPacksInstalledDataDir(null);
});

describe("mcp-demo pack semantics (fixture pack)", () => {
  it("MCP defs → ACP wire format → project view enabled chain", () => {
    // Build the demo pack with makePack (fixture, same shape as resources/teams/prismnext.mcp-demo)
    const demoDir = temp();
    makePack(demoDir, "prismnext.mcp-demo", baseManifest("prismnext.mcp-demo", { name: "MCP Demo Stack" }), {
      orchestrators: [{ id: "mcp-demo-lead" }],
      mcps: [
        {
          id: "demo-memory",
          name: "demo-memory",
          description: "A local SQLite-backed memory server (stdio).",
          transport: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
        },
        {
          id: "demo-remote",
          name: "demo-remote",
          description: "A remote HTTP placeholder server (http).",
          transport: { type: "http", url: "https://example.com/mcp" },
        },
      ],
    });
    reg(demoDir);

    const defs = getPackMcpDefs("prismnext.mcp-demo");
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name)).toEqual(["demo-memory", "demo-remote"]);

    const mem = packMcpDefToAcp(defs.find((d) => d.name === "demo-memory")!);
    expect(mem).toMatchObject({
      name: "demo-memory",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    expect(mem).not.toHaveProperty("type");
    const remote = packMcpDefToAcp(defs.find((d) => d.name === "demo-remote")!);
    expect(remote).toMatchObject({ name: "demo-remote", type: "http", url: "https://example.com/mcp" });

    const root = makeProjectRoot();
    tempDirs.push(root);
    setPacksInstalledDataDir(temp());
    addInstalledPack("prismnext.mcp-demo");

    let mcps = listProjectMcps(root);
    expect(mcps).toHaveLength(2);
    expect(mcps.every((m) => m.enabled === true)).toBe(true);

    setPackEnabled(root, "prismnext.mcp-demo", false);
    mcps = listProjectMcps(root);
    expect(mcps.every((m) => m.enabled === false)).toBe(true);
  });
});
