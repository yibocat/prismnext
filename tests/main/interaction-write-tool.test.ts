/**
 * `src/main/tools/interaction-write.ts` imports `@opencode-ai/plugin`, which is
 * a type-only shim (see `src/main/tools/opencode-plugin.d.ts`) — not a real
 * npm dependency. It cannot be imported (even with vi.mock: Vite's
 * import-analysis fails to resolve the bare specifier before the mock ever
 * applies). Read the source as text instead of importing it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  join(__dirname, "../../src/main/tools/interaction-write.ts"),
  "utf-8",
);

describe("interaction-write tool description", () => {
  it("carries a matplotlib -> plotly conversion cheatsheet", () => {
    expect(SOURCE).toMatch(/matplotlib/i);
    // spot-check a couple of the most common conversions, not an exhaustive table
    expect(SOURCE).toMatch(/ax\.plot.*scatter/i);
    expect(SOURCE).toMatch(/ax\.plot_surface.*surface/i);
    expect(SOURCE).toMatch(/imshow|pcolormesh.*heatmap/i);
  });

  it("carries the instrument marker syntax (figureTemplate + $exprGrid/$stateTrail)", () => {
    expect(SOURCE).toMatch(/figureTemplate/);
    expect(SOURCE).toMatch(/\$exprGrid/);
    expect(SOURCE).toMatch(/\$stateTrail/);
  });

  it("carries the figure.script contract (ctx keys, last-resort framing, ban list, no live bindings)", () => {
    expect(SOURCE).toMatch(/LAST RESORT/);
    expect(SOURCE).toMatch(/export function render\(ctx\)/);
    expect(SOURCE).toMatch(/role:\s*\\?"script\\?"/);
    expect(SOURCE).toMatch(/ctx\.resource/);
    expect(SOURCE).toMatch(/no live re-render/i);
    expect(SOURCE).toMatch(/eval\(\)/);
    expect(SOURCE).toMatch(/fetch\(\)/);
    expect(SOURCE).toMatch(/256KB/);
    expect(SOURCE).toMatch(/8MB/);
  });

  it("carries the diagram.mermaid contract (dual engine, text-only, byte caps, samples)", () => {
    expect(SOURCE).toMatch(/diagram\.mermaid/);
    expect(SOURCE).toMatch(/model\.engine/);
    expect(SOURCE).toMatch(/model\.source/);
    expect(SOURCE).toMatch(/"mermaid"/);
    expect(SOURCE).toMatch(/"dot"/);
    expect(SOURCE).toMatch(/role:\s*\\?"diagram-source\\?"/);
    expect(SOURCE).toMatch(/not a code sandbox/i);
    expect(SOURCE).toMatch(/No bindings\/live updates/i);
    expect(SOURCE).toMatch(/DIAGRAM_SAMPLE_MERMAID_SPEC|graph TD/);
    expect(SOURCE).toMatch(/DIAGRAM_SAMPLE_DOT_SPEC|digraph/);
  });
});
