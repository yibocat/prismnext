import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listInteractionSummaries,
  readInteractionSpec,
  upsertInteractionSpec,
  interactionSpecPath,
} from "../../src/main/services/interaction-store";
import { LEGACY_INTERACTION_SPEC_DIR_REL } from "../../src/shared/interaction-spec";

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function seedFigure(root: string, rel = "results/loss.png") {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, TINY_PNG);
  return rel;
}

describe("interaction-store upsert", () => {
  let root: string;

  it("creates and bumps revision on update", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const path = seedFigure(root);
    const created = upsertInteractionSpec(root, {
      id: "fig.loss",
      title: "Demo",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path }],
    });
    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.spec?.revision).toBe(1);

    const updated = upsertInteractionSpec(root, {
      id: "fig.loss",
      title: "Demo v2",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path }],
    });
    expect(updated.ok).toBe(true);
    expect(updated.created).toBe(false);
    expect(updated.spec?.revision).toBe(2);
    expect(updated.spec?.title).toBe("Demo v2");

    const listed = listInteractionSummaries(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revision).toBe(2);
    expect(listed[0]?.kind).toBe("figure.static");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsupported kind on upsert", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const upsert = upsertInteractionSpec(root, {
      id: "bad2",
      title: "Bad2",
      kind: "diagram.mermaid",
      compute: "local",
      revision: 1,
    });
    expect(upsert.ok).toBe(false);
    expect(upsert.error).toMatch(/unsupported kind/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects figure.static when image is missing", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const upsert = upsertInteractionSpec(root, {
      id: "fig.missing",
      title: "Missing",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path: "results/nope.png" }],
    });
    expect(upsert.ok).toBe(false);
    expect(upsert.error).toMatch(/not found/i);

    rmSync(root, { recursive: true, force: true });
  });

  it("creates plot.series from an existing CSV and rejects missing CSV", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const csvRel = "results/metrics.csv";
    mkdirSync(join(root, "results"), { recursive: true });
    writeFileSync(
      join(root, csvRel),
      "epoch,train_loss,val_loss\n0,1.0,1.1\n1,0.8,0.9\n",
    );

    const missing = upsertInteractionSpec(root, {
      id: "plot.gone",
      title: "Gone",
      kind: "plot.series",
      compute: "bound",
      revision: 1,
      params: { x: "epoch", y: ["train_loss"] },
      resources: [{ role: "data", path: "results/nope.csv" }],
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found/i);

    const created = upsertInteractionSpec(root, {
      id: "plot.loss",
      title: "Loss",
      kind: "plot.series",
      compute: "bound",
      revision: 1,
      params: { x: "epoch", y: ["train_loss", "val_loss"] },
      resources: [{ role: "data", path: csvRel }],
    });
    expect(created.ok).toBe(true);
    expect(created.spec?.kind).toBe("plot.series");
    expect(created.spec?.resources?.[0]?.path).toBe(csvRel);

    rmSync(root, { recursive: true, force: true });
  });

  it("reads legacy .prismnext/artifacts specs and migrates on upsert", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-legacy-"));
    const path = seedFigure(root);
    const legacyDir = join(root, LEGACY_INTERACTION_SPEC_DIR_REL, "fig.loss");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      join(legacyDir, "spec.json"),
      `${JSON.stringify({
        id: "fig.loss",
        title: "Legacy",
        kind: "figure.static",
        compute: "local",
        revision: 1,
        resources: [{ role: "figure", path }],
      })}\n`,
    );

    expect(existsSync(interactionSpecPath(root, "fig.loss"))).toBe(false);
    const read = readInteractionSpec(root, "fig.loss");
    expect(read.spec?.title).toBe("Legacy");

    const updated = upsertInteractionSpec(root, {
      id: "fig.loss",
      title: "Migrated",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path }],
    });
    expect(updated.ok).toBe(true);
    expect(existsSync(interactionSpecPath(root, "fig.loss"))).toBe(true);
    expect(existsSync(join(root, LEGACY_INTERACTION_SPEC_DIR_REL, "fig.loss"))).toBe(false);
    expect(readInteractionSpec(root, "fig.loss").spec?.title).toBe("Migrated");

    rmSync(root, { recursive: true, force: true });
  });

  it("bulk-migrates legacy specs when listing ids", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-bulk-"));
    const path = seedFigure(root);
    const legacyDir = join(root, LEGACY_INTERACTION_SPEC_DIR_REL, "fig.bulk");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      join(legacyDir, "spec.json"),
      `${JSON.stringify({
        id: "fig.bulk",
        title: "Bulk",
        kind: "figure.static",
        compute: "local",
        revision: 1,
        resources: [{ role: "figure", path }],
      })}\n`,
    );

    const ids = listInteractionSummaries(root).map((s) => s.id);
    expect(ids).toContain("fig.bulk");
    expect(existsSync(interactionSpecPath(root, "fig.bulk"))).toBe(true);
    expect(existsSync(legacyDir)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
