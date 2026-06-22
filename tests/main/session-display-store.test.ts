import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendUserDisplay,
  getUserDisplays,
  truncateUserDisplays,
  deleteSessionDisplays,
  restoreUserDisplays,
} from "../../src/main/services/session-display-store";

describe("session-display-store", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-display-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and reads user display snapshots per session", () => {
    const content = [{ type: "text", text: "@main.tex", inlineParts: [{ type: "text", text: "" }] }];
    appendUserDisplay(tmpDir, "sess-1", content);
    appendUserDisplay(tmpDir, "sess-1", [{ type: "text", text: "second" }]);

    expect(getUserDisplays(tmpDir, "sess-1")).toHaveLength(2);
    expect(getUserDisplays(tmpDir, "sess-1")[0]).toEqual(content);
  });

  it("truncates and deletes session displays", () => {
    appendUserDisplay(tmpDir, "sess-2", [{ type: "text", text: "a" }]);
    appendUserDisplay(tmpDir, "sess-2", [{ type: "text", text: "b" }]);
    truncateUserDisplays(tmpDir, "sess-2", 1);
    expect(getUserDisplays(tmpDir, "sess-2")).toHaveLength(1);

    deleteSessionDisplays(tmpDir, "sess-2");
    expect(getUserDisplays(tmpDir, "sess-2")).toHaveLength(0);
  });

  it("restores full display list", () => {
    appendUserDisplay(tmpDir, "sess-3", [{ type: "text", text: "a" }]);
    appendUserDisplay(tmpDir, "sess-3", [{ type: "text", text: "b" }]);
    truncateUserDisplays(tmpDir, "sess-3", 1);
    restoreUserDisplays(tmpDir, "sess-3", [
      [{ type: "text", text: "a" }],
      [{ type: "text", text: "b" }],
    ]);
    expect(getUserDisplays(tmpDir, "sess-3")).toHaveLength(2);
  });
});
