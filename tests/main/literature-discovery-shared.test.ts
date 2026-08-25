import { describe, expect, it } from "vitest";
import {
  clampDiscoveryLimit,
  normalizeDiscoverySources,
  parseDiscoveryYearRange,
  DEFAULT_DISCOVERY_SOURCES,
} from "../../src/shared/literature/discovery";

describe("literature-discovery shared", () => {
  it("defaults sources when omitted or empty", () => {
    expect(normalizeDiscoverySources(undefined)).toEqual([...DEFAULT_DISCOVERY_SOURCES]);
    expect(normalizeDiscoverySources([])).toEqual([...DEFAULT_DISCOVERY_SOURCES]);
  });

  it("keeps known sources and drops unknown", () => {
    expect(normalizeDiscoverySources(["arxiv", "nope", "pubmed"])).toEqual([
      "arxiv",
      "pubmed",
    ]);
  });

  it("parses year ranges", () => {
    expect(parseDiscoveryYearRange("2023")).toEqual({ from: 2023, to: 2023 });
    expect(parseDiscoveryYearRange("2020-2023")).toEqual({ from: 2020, to: 2023 });
    expect(parseDiscoveryYearRange("2020-")).toEqual({ from: 2020, to: null });
    expect(parseDiscoveryYearRange("")).toBeNull();
  });

  it("clamps limit 1..20 default 8", () => {
    expect(clampDiscoveryLimit(undefined)).toBe(8);
    expect(clampDiscoveryLimit(0)).toBe(1);
    expect(clampDiscoveryLimit(100)).toBe(20);
  });
});
