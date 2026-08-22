import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maybeWriteFullLog } from "../../src/main/experiment/experiment-run-executor";
import { RUN_OUTPUT_TAIL_BYTES } from "../../src/shared/experiments/log";

describe("maybeWriteFullLog", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("returns undefined when output fits in the JSONL tail budget", () => {
    root = mkdtempSync(join(tmpdir(), "prism-flog-"));
    expect(maybeWriteFullLog(root, "run-short", "hello\n", "")).toBeUndefined();
    expect(existsSync(join(root, "logs"))).toBe(false);
  });

  it("spills long stdout to logs/<runId>.log and returns lab-relative path", () => {
    root = mkdtempSync(join(tmpdir(), "prism-flog-"));
    const long = "x".repeat(RUN_OUTPUT_TAIL_BYTES + 100);
    const rel = maybeWriteFullLog(root, "run-20260716-abcd", long, "err-line\n");
    expect(rel).toBe("logs/run-20260716-abcd.log");
    const abs = join(root, rel!);
    expect(existsSync(abs)).toBe(true);
    const body = readFileSync(abs, "utf-8");
    expect(body).toContain("runId: run-20260716-abcd");
    expect(body).toContain(long.slice(0, 40));
    expect(body).toContain("stderr");
    expect(body).toContain("err-line");
  });
});
