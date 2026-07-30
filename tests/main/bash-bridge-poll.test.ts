import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ACTIVE_TOOL_FILE,
  readActiveToolCallId,
  readActiveToolRecord,
  readBashJobResult,
  resolveBashJobToolCallId,
} from "../../src/main/tools/permission-bridge-poll";

describe("bash-bridge-poll (toolCallId)", () => {
  const root = join(tmpdir(), "bash-bridge-poll-test");
  const sessionDir = join(root, "sess-1");

  beforeEach(() => {
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  it("reads active toolCallId from .active-tool.json", () => {
    writeFileSync(
      join(sessionDir, ACTIVE_TOOL_FILE),
      JSON.stringify({ toolCallId: "call-abc", command: "echo 2", startedAt: Date.now() }),
      "utf-8",
    );
    expect(readActiveToolCallId(sessionDir)).toBe("call-abc");
    expect(readActiveToolRecord(sessionDir)?.command).toBe("echo 2");
  });

  it("resolveBashJobToolCallId prefers explicit context id", () => {
    writeFileSync(
      join(sessionDir, ACTIVE_TOOL_FILE),
      JSON.stringify({ toolCallId: "from-file", command: "echo 1" }),
      "utf-8",
    );
    expect(resolveBashJobToolCallId(sessionDir, "from-context")).toBe("from-context");
    expect(resolveBashJobToolCallId(sessionDir, undefined)).toBe("from-file");
  });

  it("readBashJobResult parses result.json", () => {
    writeFileSync(
      join(sessionDir, "tool-1.result.json"),
      JSON.stringify({ output: "2\n", exitCode: 0, cwd: "/proj" }),
      "utf-8",
    );
    expect(readBashJobResult(sessionDir, "tool-1")).toMatchObject({
      output: "2\n",
      exitCode: 0,
      cwd: "/proj",
    });
  });
});
