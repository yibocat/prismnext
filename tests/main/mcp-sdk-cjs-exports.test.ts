import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Electron main emits CJS `require(specifier)`. MCP SDK 1.30's `"./*"` export
 * is `./dist/cjs/*` with no `.js`, and the package is `"type": "module"`, so
 * Node will not add the extension. Extensionless deep imports fail at load.
 */
const require = createRequire(import.meta.url);

describe("MCP SDK CJS export specifiers", () => {
  it("resolves the named client entry and .js transport paths", () => {
    expect(require.resolve("@modelcontextprotocol/sdk/client")).toMatch(/client[/\\]index\.js$/);
    expect(require.resolve("@modelcontextprotocol/sdk/client/stdio.js")).toMatch(/stdio\.js$/);
    expect(require.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js")).toMatch(
      /streamableHttp\.js$/,
    );
  });

  it("does not resolve extensionless transport paths", () => {
    expect(() => require.resolve("@modelcontextprotocol/sdk/client/stdio")).toThrow(
      /Cannot find module/,
    );
    expect(() => require.resolve("@modelcontextprotocol/sdk/client/streamableHttp")).toThrow(
      /Cannot find module/,
    );
  });
});
