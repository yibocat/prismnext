import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fsHandlers,
  _setHostWatchIntervalForTests,
  _resetHostWatchForTests,
} from "../../src/host/fs-handlers";
import type { HostHandlerContext } from "../../src/host/context";

/**
 * Host change watcher: snapshot-diff polling wired through ctx.emit using the
 * same `fs:fileChanged` channel shape as the local watcher, so the renderer
 * needs no remote-specific handling.
 */

const POLL_MS = 40;

const ctx = (root: string): HostHandlerContext => ({
  remoteRoot: root,
  projectId: null,
  emit: vi.fn(),
});

function emittedPaths(fn: ReturnType<typeof vi.fn>): string[] {
  return fn.mock.calls.flatMap(([, payload]) => (payload as { changedPaths: string[] }).changedPaths);
}

/** Real-time poll — vi.waitFor needs fake timers, which clash with real fs IO. */
async function waitForEmit(fn: ReturnType<typeof vi.fn>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (fn.mock.calls.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(fn).toHaveBeenCalled();
}

describe("host fs:watchStart snapshot diff", () => {
  let root = "";

  beforeEach(() => {
    _setHostWatchIntervalForTests(POLL_MS);
    root = mkdtempSync(join(tmpdir(), "prism-host-watch-"));
    writeFileSync(join(root, "a.tex"), "one");
  });

  afterEach(() => {
    _resetHostWatchForTests();
    _setHostWatchIntervalForTests(null);
    rmSync(root, { recursive: true, force: true });
  });

  it("emits added / changed / removed paths with the bound root", async () => {
    const c = ctx(root);
    // Resolves only after the baseline snapshot — writes below are real diffs.
    await fsHandlers["fs:watchStart"]!({}, c);

    writeFileSync(join(root, "b.txt"), "new");
    writeFileSync(join(root, "a.tex"), "edited");
    await waitForEmit(c.emit);

    expect(c.emit.mock.calls[0]![0]).toBe("fs:fileChanged");
    const payload = c.emit.mock.calls[0]![1] as {
      projectRoot: string;
      changedPaths: string[];
    };
    expect(payload.projectRoot).toBe(root);
    expect(payload.changedPaths).toContain(join(root, "b.txt"));
    expect(payload.changedPaths).toContain(join(root, "a.tex"));

    // Removal surfaces on a later tick.
    rmSync(join(root, "b.txt"));
    await vi.waitFor(() => expect(emittedPaths(c.emit)).toContain(join(root, "b.txt")));
  });

  it("does not emit when nothing changed", async () => {
    const c = ctx(root);
    await fsHandlers["fs:watchStart"]!({}, c);
    await new Promise((r) => setTimeout(r, POLL_MS * 4));
    expect(c.emit).not.toHaveBeenCalled();
  });

  it("skips dot-directories; matches scanMetadata file filtering", async () => {
    const c = ctx(root);
    await fsHandlers["fs:watchStart"]!({}, c);

    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git", "config"), "x");
    writeFileSync(join(root, ".hidden"), "x");
    await waitForEmit(c.emit);
    // `.git/` subtree is skipped entirely (same as fs:scanMetadata's walk);
    // dot-FILES are reported — identical filtering to the metadata scan, so
    // the tree cannot diverge between watcher and manual refresh.
    const all = emittedPaths(c.emit);
    expect(all).toContain(join(root, ".hidden"));
    expect(all.some((p) => p.includes("/.git/"))).toBe(false);
  });

  it("watchStop stops emitting; a new watchStart re-arms with a fresh baseline", async () => {
    const c = ctx(root);
    await fsHandlers["fs:watchStart"]!({}, c);
    await fsHandlers["fs:watchStop"]!({}, c);

    writeFileSync(join(root, "late.txt"), "x");
    await new Promise((r) => setTimeout(r, POLL_MS * 4));
    expect(c.emit).not.toHaveBeenCalled();

    const c2 = ctx(root);
    // Files present before the new watch started are baseline, not changes.
    await fsHandlers["fs:watchStart"]!({}, c2);
    expect(c2.emit).not.toHaveBeenCalled();

    writeFileSync(join(root, "fresh.txt"), "x");
    await waitForEmit(c2.emit);
    const changed = (c2.emit.mock.calls[0]![1] as { changedPaths: string[] }).changedPaths;
    expect(changed).toContain(join(root, "fresh.txt"));
    // late.txt was pre-baseline for the new watcher — no change event for it.
    expect(changed).not.toContain(join(root, "late.txt"));
  });
});
