import { describe, expect, it } from "vitest";
import {
  lastPathSegment,
  redactAbsolutePaths,
  redactLogValue,
  sanitizeLogEntry,
  type LogEntry,
} from "@shared/log-types";

describe("log path redaction", () => {
  it("keeps only the last segment of a home path", () => {
    expect(lastPathSegment("/Users/yibow/MyPro/ResearchPrism/prism-next-pro")).toBe(
      "prism-next-pro",
    );
    expect(
      redactAbsolutePaths('dir="/Users/yibow/MyPro/ResearchPrism/prism-next-pro"'),
    ).toBe('dir="…/prism-next-pro"');
  });

  it("redacts Windows home paths", () => {
    expect(redactAbsolutePaths("C:\\Users\\yibow\\proj")).toBe("…/proj");
    expect(redactAbsolutePaths("C:/Users/yibow/proj")).toBe("…/proj");
  });

  it("leaves relative names and /tmp paths alone", () => {
    expect(redactAbsolutePaths("compile.fail")).toBe("compile.fail");
    expect(redactAbsolutePaths("/tmp/demo")).toBe("/tmp/demo");
  });

  it("walks objects and arrays", () => {
    expect(
      redactLogValue({
        packageDir: "/Users/yibow/MyPro/ResearchPrism/prism-next-pro",
        nested: { raw: "/home/yibow/.config/prism-next" },
        ids: ["prismnext.pro.claim-police"],
      }),
    ).toEqual({
      packageDir: "…/prism-next-pro",
      nested: { raw: "…/prism-next" },
      ids: ["prismnext.pro.claim-police"],
    });
  });

  it("sanitizes a leftover ring entry", () => {
    const entry: LogEntry = {
      id: 1,
      ts: 1,
      level: "info",
      category: "startup",
      module: "pro-packs-discovery",
      message: "pro packs discovery complete",
      detail: { packageDir: "/Users/yibow/MyPro/ResearchPrism/prism-next-pro" },
      process: "main",
    };
    const clean = sanitizeLogEntry(entry);
    expect(JSON.stringify(clean)).toContain("…/prism-next-pro");
    expect(JSON.stringify(clean)).not.toContain("/Users/yibow");
  });
});
