import { describe, expect, it } from "vitest";
import {
  bashAlwaysPatternFromCommand,
  bashCommandMatchesAnyPattern,
  bashCommandMatchesPattern,
} from "../../src/shared/bash-allow-always";

describe("bash-allow-always", () => {
  it("derives prefix patterns from commands", () => {
    expect(bashAlwaysPatternFromCommand("git status --porcelain")).toBe("git status*");
    expect(bashAlwaysPatternFromCommand("ls")).toBe("ls*");
    expect(bashAlwaysPatternFromCommand("uv pip install numpy")).toBe("uv pip*");
  });

  it("matches commands against patterns", () => {
    expect(bashCommandMatchesPattern("git status --porcelain", "git status*")).toBe(true);
    expect(bashCommandMatchesPattern("git commit -m x", "git status*")).toBe(false);
    expect(bashCommandMatchesAnyPattern("uv pip install foo", ["uv pip*"])).toBe(true);
  });
});
