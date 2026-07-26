import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listInteractionSummaries,
  upsertInteractionSpec,
} from "../../src/main/services/interaction-store";

describe("interaction-store upsert", () => {
  let root: string;

  it("creates and bumps revision on update", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const created = upsertInteractionSpec(root, {
      id: "demo.plot",
      title: "Demo",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.spec?.revision).toBe(1);

    const updated = upsertInteractionSpec(root, {
      id: "demo.plot",
      title: "Demo v2",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
    expect(updated.ok).toBe(true);
    expect(updated.created).toBe(false);
    expect(updated.spec?.revision).toBe(2);
    expect(updated.spec?.title).toBe("Demo v2");

    const listed = listInteractionSummaries(root);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revision).toBe(2);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unsupported kind on upsert", () => {
    root = mkdtempSync(join(tmpdir(), "ix-store-"));
    const upsert = upsertInteractionSpec(root, {
      id: "bad2",
      title: "Bad2",
      kind: "custom.widget",
      compute: "local",
      revision: 1,
    });
    expect(upsert.ok).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
