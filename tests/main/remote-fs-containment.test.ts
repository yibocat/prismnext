import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";

describe("host fs containment", () => {
  it("refuses paths outside the bound remoteRoot", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-fs-"));
    mkdirSync(join(root, "ok"), { recursive: true });
    writeFileSync(join(root, "ok", "note.md"), "hi\n");
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    await expect(
      dispatchHostMethod("fs:read", { absPath: "/etc/passwd" }, ctx),
    ).rejects.toMatchObject({ code: "path_escaped" });
    const inside = await dispatchHostMethod(
      "fs:read",
      { absPath: join(root, "ok", "note.md") },
      ctx,
    ) as { content: string };
    expect(inside.content).toBe("hi\n");
  });

  it("refuses a symlink that escapes the root", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-link-"));
    const target = "/etc/passwd";
    if (!existsSync(target)) return;
    symlinkSync(target, join(root, "escape"));
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    await expect(
      dispatchHostMethod("fs:read", { absPath: join(root, "escape") }, ctx),
    ).rejects.toMatchObject({ code: "path_escaped" });
  });

  it("lists directories without a bound remoteRoot", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-list-"));
    mkdirSync(join(root, "paper"), { recursive: true });
    mkdirSync(join(root, ".hidden"), { recursive: true });
    writeFileSync(join(root, "note.md"), "x\n");
    const ctx = createHostContext();
    const listing = await dispatchHostMethod("fs:listDir", { path: root }, ctx) as {
      path: string;
      parent: string | null;
      entries: Array<{ name: string; kind: string }>;
    };
    expect(listing.path).toBe(root);
    expect(listing.entries).toEqual([{ name: "paper", kind: "dir" }]);
    await expect(dispatchHostMethod("fs:listDir", { path: "relative" }, ctx)).rejects.toMatchObject({
      code: "protocol",
    });
  });

  it("reads a 9 MiB file in two blobs", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-host-blob-"));
    const file = join(root, "big.bin");
    const payload = Buffer.alloc(9 * 1024 * 1024, 7);
    writeFileSync(file, payload);
    const ctx = createHostContext();
    ctx.remoteRoot = root;
    const first = await dispatchHostMethod(
      "fs:readBlob",
      { path: file, offset: 0, length: 4 * 1024 * 1024 },
      ctx,
    ) as { bytes: string; eof: boolean };
    const second = await dispatchHostMethod(
      "fs:readBlob",
      { path: file, offset: 4 * 1024 * 1024, length: 5 * 1024 * 1024 },
      ctx,
    ) as { bytes: string; eof: boolean };
    expect(first.eof).toBe(false);
    expect(second.eof).toBe(true);
    const assembled = Buffer.concat([
      Buffer.from(first.bytes, "base64"),
      Buffer.from(second.bytes, "base64"),
    ]);
    expect(assembled.equals(payload)).toBe(true);
  });
});
