import { describe, expect, it } from "vitest";
import {
  autoCompilePreferenceKey,
  defaultAutoCompileForProjectRoot,
  migrateCompileAutoCompilePersist,
  resolveAutoCompileForProjectRoot,
} from "../../src/shared/compile/auto-compile-pref";

describe("auto-compile preference", () => {
  it("defaults remote roots off and local roots on", () => {
    expect(defaultAutoCompileForProjectRoot("/Users/me/paper")).toBe(true);
    expect(defaultAutoCompileForProjectRoot("remote://lab/home/ubuntu/paper")).toBe(false);
    expect(defaultAutoCompileForProjectRoot(null)).toBe(true);
  });

  it("honors a remembered toggle per canonical root", () => {
    const remote = "remote://lab/home/ubuntu/paper";
    const collapsed = "remote:/lab/home/ubuntu/paper";
    expect(autoCompilePreferenceKey(collapsed)).toBe(remote);

    const byRoot = { [remote]: true, "/Users/me/paper": false };
    expect(resolveAutoCompileForProjectRoot(byRoot, collapsed)).toBe(true);
    expect(resolveAutoCompileForProjectRoot(byRoot, "/Users/me/paper")).toBe(false);
    expect(resolveAutoCompileForProjectRoot({}, remote)).toBe(false);
    expect(resolveAutoCompileForProjectRoot({}, "/Users/me/other")).toBe(true);
  });

  it("migrates the old global switch into the local default only", () => {
    expect(migrateCompileAutoCompilePersist({ autoCompile: false }, 0)).toEqual({
      autoCompileByRoot: {},
      localAutoCompileDefault: false,
    });
    expect(migrateCompileAutoCompilePersist({ autoCompile: true }, 0)).toEqual({
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
    });
    expect(resolveAutoCompileForProjectRoot({}, "remote://lab/home/p", false)).toBe(false);
    expect(resolveAutoCompileForProjectRoot({}, "/Users/me/paper", false)).toBe(false);
  });
});
