import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), "prism-ix-bridge-userdata"),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

import { processInteractionBridgeOnceForTests } from "../../src/main/services/interaction-bridge";
import { getInteractionBridgeRoot } from "../../src/main/services/prism-bridge-paths";

const bridgeRoot = path.join(os.tmpdir(), "prism-interaction-bridge-test");
const projectRoots: string[] = [];

beforeEach(() => {
  process.env.PRISM_INTERACTION_BRIDGE_ROOT = bridgeRoot;
  fs.mkdirSync(bridgeRoot, { recursive: true });
});

afterEach(() => {
  for (const root of projectRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (fs.existsSync(bridgeRoot)) {
    fs.rmSync(bridgeRoot, { recursive: true, force: true });
  }
});

describe("interaction-bridge", () => {
  it("writes spec and returns fence hint", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ix-bridge-proj-"));
    projectRoots.push(projectRoot);
    const sessionId = "test-session";
    const sessionDir = path.join(getInteractionBridgeRoot(), sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const requestId = "req-1";
    fs.writeFileSync(
      path.join(sessionDir, `${requestId}.request.json`),
      JSON.stringify({
        action: "write",
        sessionId,
        projectRoot,
        spec: {
          id: "demo.plot",
          title: "Demo loss",
          kind: "plot.line",
          compute: "local",
          revision: 1,
        },
      }),
      "utf-8",
    );

    await processInteractionBridgeOnceForTests();

    const result = JSON.parse(
      fs.readFileSync(path.join(sessionDir, `${requestId}.result.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.fenceMarkdown).toContain("```interaction");
    expect(result.fenceMarkdown).toContain("id: demo.plot");
    expect(result.relativePath).toBe(".prismnext/artifacts/demo.plot/spec.json");
  });
});
