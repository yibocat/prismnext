import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Bytes, syncRemoteFile, resetRemoteSyncForTests, remoteCacheRoot } from "../../src/main/remote/sync-client";
import { applyMirroredSession, listMirroredSessions } from "../../src/main/remote/session-mirror";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("remote sync client", () => {
  afterEach(() => {
    resetRemoteSyncForTests();
    setWorkbenchUserHomeOverride(null);
  });

  it("writes a hashed manifest entry and skips node_modules", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-sync-"));
    setWorkbenchUserHomeOverride(home);
    const calls: string[] = [];
    const broker = {
      isBound: () => true,
      invoke: async (_profile: string, method: string, params: unknown) => {
        calls.push(method);
        if (method === "fs:stat") {
          const path = String((params as { path?: string }).path ?? "");
          if (path.includes("node_modules")) return { size: 12, isFile: true, mtimeMs: 1 };
          return { size: 5, isFile: true, mtimeMs: 2 };
        }
        return { bytes: Buffer.from("hello").toString("base64"), eof: true };
      },
    };
    const skipped = await syncRemoteFile(broker, {
      profileId: "lab",
      projectId: "p1",
      remoteAbs: "remote://lab/home/u/node_modules/x.js",
      destRel: "node_modules/x.js",
    });
    expect(skipped).toMatchObject({ ok: true, skipped: "exclude" });

    const ok = await syncRemoteFile(broker, {
      profileId: "lab",
      projectId: "p1",
      remoteAbs: "remote://lab/home/u/src/main.tex",
      destRel: "src/main.tex",
    });
    expect(ok.ok).toBe(true);
    const cache = remoteCacheRoot("lab", "p1");
    const dest = join(cache, "files", "src/main.tex");
    expect(readFileSync(dest, "utf8")).toBe("hello");
    expect(sha256Bytes(Buffer.from("hello"))).toHaveLength(64);
  });

  it("backs up a local session and keeps the remote copy", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-mirror-"));
    setWorkbenchUserHomeOverride(home);
    applyMirroredSession("lab", "p1", {
      conversationId: "c1",
      title: "old",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const result = applyMirroredSession("lab", "p1", {
      conversationId: "c1",
      title: "new",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    expect(result.conflicted).toBeTruthy();
    expect(result.conflicted).toMatch(/local-conflict\.json$/);
    const listed = listMirroredSessions("lab", "p1");
    expect(listed[0]?.title).toBe("new");
    expect(readFileSync(result.conflicted!, "utf8")).toContain("old");
  });
});
