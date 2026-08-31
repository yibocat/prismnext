import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRegisteredHostMethods } from "../../src/host/handler-registry";
import { planTypstPreviewForwards } from "../../src/shared/typst/preview-tunnel";
import {
  ensureTypstPreviewForwards,
  releaseTypstPreviewForwards,
  rewriteReadyEventForLaptop,
} from "../../src/main/remote/typst-preview-tunnel";

const ipc = readFileSync(join(__dirname, "../../src/main/ipc/typst.ts"), "utf8");
const remoteIpc = readFileSync(join(__dirname, "../../src/main/ipc/remote.ts"), "utf8");
const index = readFileSync(join(__dirname, "../../src/main/ipc/index.ts"), "utf8");
const hostTypst = readFileSync(join(__dirname, "../../src/host/typst-handlers.ts"), "utf8");
const sessionStore = readFileSync(join(__dirname, "../../src/renderer/stores/typst-session-store.ts"), "utf8");

describe("remote typst IPC routing", () => {
  it("forwards typst methods through domain-route on projectRoot", () => {
    expect(index).toContain("registerTypstHandlers");
    expect(ipc).toContain("routeHostDomainMethod");
    expect(ipc).toContain('keys: ["projectRoot"]');
    expect(ipc).not.toContain("useCurrentRoot");
    for (const method of [
      "typst:ensureSession",
      "typst:didOpen",
      "typst:didChange",
      "typst:didClose",
      "typst:previewStart",
      "typst:previewStop",
    ]) {
      expect(ipc).toContain(method);
    }
    expect(ipc).toContain('error: "not_connected"');
  });

  it("registers the same typst methods on the Host", () => {
    const methods = listRegisteredHostMethods();
    for (const method of [
      "typst:didChange",
      "typst:previewStart",
      "typst:ensureSession",
      "typst:didOpen",
      "typst:didClose",
      "typst:previewStop",
    ]) {
      expect(methods).toContain(method);
    }
  });

  it("does not broadcast Host previewReady (URL is rewritten after SSH -L)", () => {
    expect(remoteIpc).toContain('channel === "typst:previewReady"');
    expect(hostTypst).toContain("session.onPreviewReady = null");
    expect(ipc).toContain("rewriteReadyEventForLaptop");
    expect(ipc).toContain("ensureTypstPreviewForwards");
  });

  it("routes remote typing through the Tinymist session store, not watch", () => {
    expect(sessionStore).not.toContain("scheduleTypstLive");
    expect(sessionStore).not.toContain("REMOTE FALLBACK");
  });
});

describe("typst preview tunnel manager", () => {
  afterEach(async () => {
    await releaseTypstPreviewForwards("lab");
  });

  it("picks any local port for static and same-number for a split data-plane", async () => {
    const opens: Array<{ remote: number; preferred?: number }> = [];
    const plan = planTypstPreviewForwards({
      previewUrl: "http://127.0.0.1:4000/",
      staticServerPort: 4000,
      dataPlanePort: 4001,
    });
    const map = await ensureTypstPreviewForwards("lab", plan, async (remotePort, localPort) => {
      opens.push({ remote: remotePort, preferred: localPort });
      return { localPort: localPort ?? 49152, close: async () => undefined };
    });
    expect(opens).toEqual([
      { remote: 4000, preferred: undefined },
      { remote: 4001, preferred: 4001 },
    ]);
    expect(map.get(4000)).toBe(49152);
    expect(map.get(4001)).toBe(4001);
    const ready = rewriteReadyEventForLaptop({
      projectRoot: "/paper",
      compileRoot: "main.typ",
      previewUrl: "http://127.0.0.1:4000/",
      taskId: "t1",
      staticServerPort: 4000,
      dataPlanePort: 4001,
    }, plan, map);
    expect(ready.previewUrl).toBe("http://127.0.0.1:49152/");
  });

  it("reuses an existing static forward", async () => {
    let opens = 0;
    const plan = planTypstPreviewForwards({ previewUrl: "http://127.0.0.1:56299/" });
    const open = async (remotePort: number, localPort?: number) => {
      opens += 1;
      return { localPort: localPort ?? 9, close: async () => undefined };
    };
    await ensureTypstPreviewForwards("lab", plan, open);
    await ensureTypstPreviewForwards("lab", plan, open);
    expect(opens).toBe(1);
  });
});
