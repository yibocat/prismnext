import { describe, expect, it, vi } from "vitest";
import {
  buildGhPrCreateArgs,
  firstCommitSubject,
  formatAskAgentPrPrompt,
  formatGhPrCreateCommand,
  parseGhAuthStatus,
  parseGhPrCreateOutput,
  pickDefaultBranch,
} from "../../src/shared/git-hosting";
import type { GhRunner } from "../../src/main/git-hosting/gh";
import { ghAuthStatus, ghPrCreate, ghPrViewWeb } from "../../src/main/git-hosting/gh";

describe("parseGhAuthStatus", () => {
  it("reports missing gh", () => {
    expect(parseGhAuthStatus({ installed: false, exitCode: 1, output: "" })).toEqual({
      installed: false,
      authenticated: false,
      error: "gh is not installed",
    });
  });

  it("parses a logged-in account from gh auth status", () => {
    const output = `
github.com
  ✓ Logged in to github.com account monalisa (keyring)
  - Active account: true
`;
    expect(parseGhAuthStatus({ installed: true, exitCode: 0, output })).toEqual({
      installed: true,
      authenticated: true,
      username: "monalisa",
    });
  });

  it("treats a non-zero auth status as not logged in", () => {
    const status = parseGhAuthStatus({
      installed: true,
      exitCode: 1,
      output: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
    });
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.error).toMatch(/not logged/i);
  });
});

describe("parseGhPrCreateOutput", () => {
  it("reads url and number from JSON", () => {
    expect(
      parseGhPrCreateOutput('{"url":"https://github.com/org/paper/pull/12","number":12}', ""),
    ).toEqual({
      url: "https://github.com/org/paper/pull/12",
      number: 12,
    });
  });

  it("falls back to a GitHub pull URL in plain output", () => {
    expect(parseGhPrCreateOutput("https://github.com/org/paper/pull/9\n", "")).toEqual({
      url: "https://github.com/org/paper/pull/9",
      number: 9,
    });
  });
});

describe("buildGhPrCreateArgs / formatGhPrCreateCommand", () => {
  it("uses --fill when the body is empty", () => {
    expect(
      buildGhPrCreateArgs({
        title: "Add figure",
        base: "master",
        head: "feat/fig",
      }),
    ).toEqual([
      "pr",
      "create",
      "--base",
      "master",
      "--head",
      "feat/fig",
      "--title",
      "Add figure",
      "--fill",
      "--json",
      "url,number",
    ]);
  });

  it("passes --body and --draft when set", () => {
    expect(
      buildGhPrCreateArgs({
        title: "Add figure",
        base: "main",
        head: "feat/fig",
        body: "Details",
        draft: true,
      }),
    ).toEqual([
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "feat/fig",
      "--title",
      "Add figure",
      "--body",
      "Details",
      "--draft",
      "--json",
      "url,number",
    ]);
  });

  it("formats a copy-paste command", () => {
    expect(
      formatGhPrCreateCommand({
        title: "Add figure",
        base: "master",
        head: "feat/fig",
      }),
    ).toBe("gh pr create --base master --head feat/fig --title 'Add figure' --fill");
  });
});

describe("firstCommitSubject / pickDefaultBranch / Ask Agent prompt", () => {
  it("takes the first line of a commit message", () => {
    expect(firstCommitSubject("Add figure\n\nMore detail")).toBe("Add figure");
  });

  it("prefers main, then master", () => {
    expect(pickDefaultBranch(["feat", "master", "main"])).toBe("main");
    expect(pickDefaultBranch(["feat", "master"])).toBe("master");
    expect(pickDefaultBranch(["feat"])).toBe("feat");
  });

  it("asks the agent to create a PR without sending it", () => {
    const prompt = formatAskAgentPrPrompt({
      head: "feat/fig",
      base: "master",
      title: "Add figure",
    });
    expect(prompt).toMatch(/gh pr create/);
    expect(prompt).toMatch(/feat\/fig/);
    expect(prompt).toMatch(/master/);
    expect(prompt).toMatch(/Add figure/);
  });
});

describe("ghAuthStatus / ghPrCreate / ghPrViewWeb", () => {
  it("returns not installed when gh --version is missing", async () => {
    const run: GhRunner = async (_cwd, args) => {
      if (args[0] === "--version") return { exitCode: 1, stdout: "", stderr: "", notFound: true };
      throw new Error(`unexpected ${args.join(" ")}`);
    };
    await expect(ghAuthStatus("/repo", run)).resolves.toEqual({
      installed: false,
      authenticated: false,
      error: "gh is not installed",
    });
  });

  it("creates a PR with the built args and parses JSON", async () => {
    const run = vi.fn<GhRunner>(async (_cwd, args) => {
      expect(args).toEqual(
        buildGhPrCreateArgs({
          title: "Add figure",
          base: "master",
          head: "feat/fig",
        }),
      );
      return {
        exitCode: 0,
        stdout: '{"url":"https://github.com/org/paper/pull/4","number":4}',
        stderr: "",
      };
    });
    await expect(
      ghPrCreate(
        {
          projectRoot: "/repo",
          title: "Add figure",
          base: "master",
          head: "feat/fig",
        },
        run,
      ),
    ).resolves.toEqual({
      success: true,
      url: "https://github.com/org/paper/pull/4",
      number: 4,
      output: '{"url":"https://github.com/org/paper/pull/4","number":4}',
    });
  });

  it("surfaces create stderr on failure", async () => {
    const run: GhRunner = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "GraphQL: Head sha can't be blank (createPullRequest)",
    });
    const result = await ghPrCreate(
      { projectRoot: "/repo", title: "x", base: "main", head: "feat" },
      run,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Head sha/);
  });

  it("opens the PR in the browser via gh pr view --web", async () => {
    const run = vi.fn<GhRunner>(async (_cwd, args) => {
      expect(args).toEqual(["pr", "view", "https://github.com/org/paper/pull/4", "--web"]);
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    await expect(
      ghPrViewWeb("/repo", { url: "https://github.com/org/paper/pull/4" }, run),
    ).resolves.toEqual({ success: true });
  });
});
