import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";

const SPEC = {
  id: "fig.demo",
  title: "Demo figure",
  kind: "figure.static",
  compute: "local",
  revision: 1,
  resources: [{ role: "figure", path: "figures/demo.pdf" }],
};

describe("host interaction handlers", () => {
  it("writes and reads a spec on the bound remote root", async () => {
    const paper = mkdtempSync(join(tmpdir(), "prism-host-ix-"));
    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    const written = await dispatchHostMethod(
      "interaction:write",
      { projectRoot: paper, spec: SPEC },
      ctx,
    ) as { ok?: boolean };
    expect(written.ok).toBe(true);
    const got = await dispatchHostMethod(
      "interaction:get",
      { projectRoot: paper, id: "fig.demo" },
      ctx,
    ) as { spec?: { id?: string; title?: string } | null };
    expect(got.spec?.id).toBe("fig.demo");
    expect(got.spec?.title).toBe("Demo figure");
    const listed = await dispatchHostMethod("interaction:list", { projectRoot: paper }, ctx) as {
      ids?: string[];
    };
    expect(listed.ids).toContain("fig.demo");
  });
});
