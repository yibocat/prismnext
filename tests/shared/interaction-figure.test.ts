import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveFigureAbsPath,
  validateFigureStaticSpec,
} from "../../src/shared/interaction-figure-fs";
import { pickFigureResourcePath } from "../../src/shared/interaction-figure";
import type { InteractionSpec } from "../../src/shared/interaction-spec";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function baseSpec(over: Partial<InteractionSpec> = {}): InteractionSpec {
  return {
    id: "fig.demo",
    title: "Demo",
    kind: "figure.static",
    compute: "local",
    revision: 1,
    ...over,
  };
}

describe("interaction-figure", () => {
  it("picks role=figure over other image paths", () => {
    const path = pickFigureResourcePath(
      baseSpec({
        resources: [
          { role: "thumb", path: "a.png" },
          { role: "figure", path: "b.png" },
        ],
      }),
    );
    expect(path).toBe("b.png");
  });

  it("rejects path escape and missing files", () => {
    const root = mkdtempSync(join(tmpdir(), "ix-fig-"));
    expect(resolveFigureAbsPath(root, "../outside.png")).toBeNull();

    const missing = validateFigureStaticSpec(
      root,
      baseSpec({ resources: [{ role: "figure", path: "gone.png" }] }),
      () => false,
    );
    expect(missing.ok).toBe(false);

    mkdirSync(join(root, "out"), { recursive: true });
    writeFileSync(join(root, "out", "ok.png"), TINY_PNG);
    const ok = validateFigureStaticSpec(
      root,
      baseSpec({ resources: [{ role: "figure", path: "out/ok.png" }] }),
      (abs) => abs.endsWith("ok.png"),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.relPath.replace(/\\/g, "/")).toBe("out/ok.png");

    rmSync(root, { recursive: true, force: true });
  });
});
