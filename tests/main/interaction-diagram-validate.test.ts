import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InteractionSpec } from "../../src/shared/interaction-spec";
import {
  DIAGRAM_MAX_INLINE_BYTES,
  DIAGRAM_SAMPLE_DOT_SPEC,
  DIAGRAM_SAMPLE_MERMAID_SPEC,
} from "../../src/shared/interaction-diagram";
import { validateDiagramSpec } from "../../src/main/services/interaction-diagram-validate";

function baseSpec(overrides?: Partial<InteractionSpec>): InteractionSpec {
  return {
    id: "demo.diagram",
    title: "Demo diagram",
    kind: "diagram.mermaid",
    compute: "local",
    revision: 1,
    ...overrides,
  };
}

describe("validateDiagramSpec (main)", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("accepts a valid inline mermaid spec", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    const result = validateDiagramSpec(
      root,
      baseSpec({ model: { source: "graph TD; A-->B;" } }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an empty/whitespace-only inline source", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    const result = validateDiagramSpec(root, baseSpec({ model: { source: "   " } }));
    expect(result.ok).toBe(false);
  });

  it("rejects an inline source over the byte cap", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    const big = "a".repeat(DIAGRAM_MAX_INLINE_BYTES + 1);
    const result = validateDiagramSpec(root, baseSpec({ model: { source: big } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  it("accepts a file mode spec when the file exists, rejects when missing", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    const dir = join(root, ".prismnext", "artifacts", "demo.diagram");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "diagram.dot"), "digraph { a -> b; }", "utf8");

    const ok = validateDiagramSpec(
      root,
      baseSpec({
        model: { engine: "dot" },
        resources: [{ role: "diagram-source", path: "diagram.dot" }],
      }),
    );
    expect(ok.ok).toBe(true);

    const missing = validateDiagramSpec(
      root,
      baseSpec({
        model: { engine: "dot" },
        resources: [{ role: "diagram-source", path: "missing.dot" }],
      }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/not found on disk/i);
  });

  it("rejects an invalid engine value", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    const result = validateDiagramSpec(
      root,
      baseSpec({ model: { engine: "neato", source: "digraph { a -> b; }" } }),
    );
    expect(result.ok).toBe(false);
  });

  it("round-trips both sample specs", () => {
    root = mkdtempSync(join(tmpdir(), "ix-diagram-"));
    expect(validateDiagramSpec(root, DIAGRAM_SAMPLE_MERMAID_SPEC as unknown as InteractionSpec).ok).toBe(
      true,
    );
    expect(validateDiagramSpec(root, DIAGRAM_SAMPLE_DOT_SPEC as unknown as InteractionSpec).ok).toBe(
      true,
    );
  });
});
