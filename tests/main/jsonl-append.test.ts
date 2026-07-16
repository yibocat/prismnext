import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendJsonlLine,
  LOCK_STALE_MS,
  withJsonlLock,
} from "../../src/main/lib/jsonl-append";

describe("jsonl-append", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(join(tmpdir(), "prism-jsonl-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends one JSON line per call and creates parent dirs", () => {
    const path = join(dir, "nested", "events.jsonl");
    appendJsonlLine(path, { id: 1 });
    appendJsonlLine(path, { id: 2 });
    const lines = fs.readFileSync(path, "utf-8").trimEnd().split("\n");
    expect(lines).toEqual([JSON.stringify({ id: 1 }), JSON.stringify({ id: 2 })]);
  });

  it("serializes sequential lock holders", () => {
    const path = join(dir, "runs.jsonl");
    const order: number[] = [];
    withJsonlLock(path, () => {
      order.push(1);
    });
    withJsonlLock(path, () => {
      order.push(2);
    });
    expect(order).toEqual([1, 2]);
  });

  it("releases the lock after a throwing critical section", () => {
    const path = join(dir, "prov.jsonl");
    expect(() =>
      withJsonlLock(path, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    appendJsonlLine(path, { ok: true });
    expect(fs.readFileSync(path, "utf-8").trim()).toBe(JSON.stringify({ ok: true }));
  });

  it("breaks a stale .lock so append can proceed (Bug #38)", () => {
    const path = join(dir, "stale.jsonl");
    const lockPath = `${path}.lock`;
    fs.writeFileSync(lockPath, "");
    const old = new Date(Date.now() - LOCK_STALE_MS - 1_000);
    fs.utimesSync(lockPath, old, old);
    appendJsonlLine(path, { recovered: true });
    expect(fs.readFileSync(path, "utf-8").trim()).toBe(JSON.stringify({ recovered: true }));
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
