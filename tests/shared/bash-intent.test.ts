import { describe, expect, it } from "vitest";
import { matchBashException } from "../../src/shared/permissions/bash-intent";

describe("matchBashException", () => {
  it("only names install and delete — ordinary commands are unlisted", () => {
    expect(matchBashException("pip install requests")).toBe("install");
    expect(matchBashException("python -m pip install numpy")).toBe("install");
    expect(matchBashException("pnpm add lodash")).toBe("install");
    expect(matchBashException("npm ci")).toBe("install");
    expect(matchBashException("rm -rf build")).toBe("delete");
    expect(matchBashException("rmdir empty")).toBe("delete");

    expect(matchBashException("mkdir -p out")).toBeNull();
    expect(matchBashException("ls -la")).toBeNull();
    expect(matchBashException("git status")).toBeNull();
    expect(matchBashException("python train.py")).toBeNull();
    expect(matchBashException("make build")).toBeNull();
    expect(matchBashException("pip list")).toBeNull();
    expect(matchBashException("npm test")).toBeNull();
  });
});
