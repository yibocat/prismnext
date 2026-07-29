import { mkdirSync, mkdtempSync, openSync, ftruncateSync, closeSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InteractionSpec } from "../../src/shared/interaction-spec";
import {
  SCRIPT_MAX_BYTES,
  SCRIPT_RESOURCES_MAX_BYTES,
  SCRIPT_SAMPLE_JS,
  SCRIPT_SAMPLE_SPEC,
} from "../../src/shared/interaction-script";
import { validateScriptSpec } from "../../src/main/services/interaction-script-validate";

function baseSpec(overrides?: Partial<InteractionSpec>): InteractionSpec {
  return {
    id: "demo.script",
    title: "Demo script",
    kind: "figure.script",
    compute: "local",
    revision: 1,
    resources: [{ role: "script", path: "script.js" }],
    ...overrides,
  };
}

describe("validateScriptSpec (main)", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function writeArtifact(id: string, files: Record<string, string>) {
    for (const [name, content] of Object.entries(files)) {
      const abs = join(root, ".prismnext", "artifacts", id, name);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    }
  }

  it("accepts a valid script, reports threeEnabled:false by default", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    writeArtifact("demo.script", { "script.js": "export function render(ctx) {}" });
    const result = validateScriptSpec(root, baseSpec());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.threeEnabled).toBe(false);
      expect(result.scriptPath).toContain("script.js");
    }
  });

  it("reports threeEnabled:true when model.three is true", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    writeArtifact("demo.script", { "script.js": "export function render(ctx) {}" });
    const result = validateScriptSpec(root, baseSpec({ model: { three: true } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.threeEnabled).toBe(true);
  });

  it("rejects a spec with no role:script resource", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    const result = validateScriptSpec(root, baseSpec({ resources: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("script");
  });

  it("rejects a missing script file", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    const result = validateScriptSpec(root, baseSpec());
    expect(result.ok).toBe(false);
  });

  it("rejects a script file over SCRIPT_MAX_BYTES", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    const big = "export function render(ctx) {}\n" + "// pad\n".repeat(SCRIPT_MAX_BYTES);
    writeArtifact("demo.script", { "script.js": big });
    const result = validateScriptSpec(root, baseSpec());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/large|byte/i);
  });

  it("rejects a script containing a banned construct", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    writeArtifact("demo.script", {
      "script.js": "export function render(ctx) { fetch('https://x.com'); }",
    });
    const result = validateScriptSpec(root, baseSpec());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/fetch/i);
  });

  it("rejects a script missing the render export", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    writeArtifact("demo.script", { "script.js": "export function setup(ctx) {}" });
    const result = validateScriptSpec(root, baseSpec());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/render/i);
  });

  it("rejects when declared resources exceed SCRIPT_RESOURCES_MAX_BYTES combined (stat-only)", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    writeArtifact("demo.script", { "script.js": "export function render(ctx) {}" });
    const bigPath = join(root, ".prismnext", "artifacts", "demo.script", "data.json");
    const fd = openSync(bigPath, "w");
    ftruncateSync(fd, SCRIPT_RESOURCES_MAX_BYTES + 1024);
    closeSync(fd);
    const result = validateScriptSpec(
      root,
      baseSpec({
        resources: [
          { role: "script", path: "script.js" },
          { role: "data", path: "data.json" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/large|byte/i);
  });

  it("SCRIPT_SAMPLE_SPEC + SCRIPT_SAMPLE_JS round-trip as a legal spec", () => {
    root = mkdtempSync(join(tmpdir(), "ix-script-"));
    const sampleSpec = SCRIPT_SAMPLE_SPEC as InteractionSpec;
    writeArtifact(sampleSpec.id, { "script.js": SCRIPT_SAMPLE_JS });
    const result = validateScriptSpec(root, sampleSpec);
    expect(result.ok).toBe(true);
  });
});
