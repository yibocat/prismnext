import { afterEach, describe, expect, it } from "vitest";
import {
  hostListingCacheKey,
  invalidateHostListingCache,
  readHostListingCache,
  writeHostListingCache,
} from "../../src/main/remote/fs-bridge";

describe("remote listing cache", () => {
  afterEach(() => {
    invalidateHostListingCache();
  });

  it("returns a hit inside the TTL and misses after", () => {
    const key = hostListingCacheKey("ssh_lab", "fs:listDir", "/home/alice/paper");
    writeHostListingCache(key, { entries: ["a"] }, 1_000);
    expect(readHostListingCache(key, 1_400)).toEqual({ entries: ["a"] });
    expect(readHostListingCache(key, 2_600)).toBeNull();
  });

  it("invalidates one profile without touching another", () => {
    writeHostListingCache(hostListingCacheKey("a", "fs:scan", "/x"), ["a"], 1);
    writeHostListingCache(hostListingCacheKey("b", "fs:scan", "/x"), ["b"], 1);
    invalidateHostListingCache("a");
    expect(readHostListingCache(hostListingCacheKey("a", "fs:scan", "/x"), 2)).toBeNull();
    expect(readHostListingCache(hostListingCacheKey("b", "fs:scan", "/x"), 2)).toEqual(["b"]);
  });
});
