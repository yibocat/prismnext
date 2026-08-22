import { describe, expect, it } from "vitest";
import {
  extractOutsideProjectPathArgs,
  isWholeDiskSearchBashCommand,
  wholeDiskSearchBlockMessage,
} from "../../src/shared/permissions/project-escape-guard";

const ROOT = "/proj";
const HOME = "/home/u";

describe("isWholeDiskSearchBashCommand", () => {
  it("matches mdfind / locate as command words", () => {
    expect(isWholeDiskSearchBashCommand("mdfind -name SKILL.md")).toBe(true);
    expect(isWholeDiskSearchBashCommand("sudo mdfind foo")).toBe(true);
    expect(isWholeDiskSearchBashCommand("echo a && mdfind b")).toBe(true);
    expect(isWholeDiskSearchBashCommand("echo a; locate b")).toBe(true);
    expect(isWholeDiskSearchBashCommand("/usr/bin/mdfind x")).toBe(true);
    expect(isWholeDiskSearchBashCommand("locate '*.pdf' | head")).toBe(true);
  });

  it("ignores mentions that are not command position", () => {
    expect(isWholeDiskSearchBashCommand("which mdfind")).toBe(false);
    expect(isWholeDiskSearchBashCommand("echo mdfind")).toBe(false);
    expect(isWholeDiskSearchBashCommand("cat mdfind-notes.md")).toBe(false);
    expect(isWholeDiskSearchBashCommand("")).toBe(false);
  });

  it("block message points at grep/glob and Settings allowed paths", () => {
    const msg = wholeDiskSearchBlockMessage();
    expect(msg).toContain("grep/glob");
    expect(msg).toContain("Allowed paths");
  });
});

describe("extractOutsideProjectPathArgs", () => {
  const run = (command: string, cwd: string | null = ROOT, allowedPaths?: string[]) =>
    extractOutsideProjectPathArgs(command, cwd, ROOT, { homeDir: HOME, allowedPaths });

  it("flags absolute paths outside the project on file-access verbs", () => {
    expect(run("cat /outside/x.md")).toEqual(["/outside/x.md"]);
    expect(run("grep -r foo /outside/dir")).toEqual(["/outside/dir"]);
    expect(run("cp /outside/render.mjs .")).toEqual(["/outside/render.mjs"]);
  });

  it("flags ~ / $HOME paths outside the project", () => {
    expect(run("cat ~/secrets.txt")).toEqual(["~/secrets.txt"]);
    expect(run("ls $HOME/other")).toEqual(["$HOME/other"]);
  });

  it("does not flag ~ paths that resolve inside the project", () => {
    const cmd = "cat ~/proj/notes.md";
    expect(
      extractOutsideProjectPathArgs(cmd, "/home/u/proj", "/home/u/proj", { homeDir: HOME }),
    ).toEqual([]);
  });

  it("flags relative paths that escape the project", () => {
    expect(run("cat ../../sibling/SKILL.md", "/proj/sub")).toEqual(["../../sibling/SKILL.md"]);
  });

  it("tracks cd chains so later bare reads resolve outside", () => {
    expect(run("cd /outside && cat x.md")).toEqual(["x.md"]);
    expect(run("cd /outside && cat dir/x.md")).toEqual(["dir/x.md"]);
  });

  it("flags bare filenames only when cwd is outside the project", () => {
    expect(run("cat notes.md", "/outside")).toEqual(["notes.md"]);
    expect(run("cat notes.md", ROOT)).toEqual([]);
  });

  it("exempts paths under allowedPaths", () => {
    expect(run("cat /refs/papers.bib", ROOT, ["/refs"])).toEqual([]);
    expect(run("cat /refs/papers.bib && cat /other/x", ROOT, ["/refs"])).toEqual(["/other/x"]);
  });

  it("exempts read-only bash verbs under enabled skill folders", () => {
    const skill = "/app/teams/prismnext.core/skills/figure-tikz";
    const opts = { homeDir: HOME, skillReadRoots: [skill] };
    expect(extractOutsideProjectPathArgs(
      `ls ${skill}/library`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([]);
    expect(extractOutsideProjectPathArgs(
      `cat ${skill}/library/catalog.json`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([]);
    expect(extractOutsideProjectPathArgs(
      `find ${skill} -name template.tex`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([]);
    expect(extractOutsideProjectPathArgs(
      `cd ${skill} && cat library/catalog.json`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([]);
  });

  it("still flags writes and copies that touch a skill folder", () => {
    const skill = "/app/teams/prismnext.core/skills/figure-tikz";
    const opts = { homeDir: HOME, skillReadRoots: [skill] };
    expect(extractOutsideProjectPathArgs(
      `cp ${skill}/library/templates/gan/template.tex figures/gan.tex`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([`${skill}/library/templates/gan/template.tex`]);
    expect(extractOutsideProjectPathArgs(
      `sed -i s/x/y/ ${skill}/SKILL.md`,
      ROOT,
      ROOT,
      opts,
    )).toEqual([`${skill}/SKILL.md`]);
  });

  it("does not treat an unrelated outside path as a skill read", () => {
    const skill = "/app/teams/prismnext.core/skills/figure-tikz";
    expect(extractOutsideProjectPathArgs(
      "cat /elsewhere/SKILL.md",
      ROOT,
      ROOT,
      { homeDir: HOME, skillReadRoots: [skill] },
    )).toEqual(["/elsewhere/SKILL.md"]);
  });

  it("ignores in-project paths, bare names, flags, URLs, non-verbs", () => {
    expect(run("cat src/a.ts")).toEqual([]);
    expect(run("cat notes.md")).toEqual([]);
    expect(run("cat ./a.md")).toEqual([]);
    expect(run("ls --sort=time")).toEqual([]);
    expect(run("echo /outside/x")).toEqual([]);
    expect(run("python /outside/script.py")).toEqual([]);
    expect(run("curl https://example.com/x.pdf")).toEqual([]);
  });

  it("handles wrappers, env prefixes, quotes, and separators", () => {
    expect(run("sudo cat /outside/x")).toEqual(["/outside/x"]);
    expect(run("FOO=bar cat /outside/x")).toEqual(["/outside/x"]);
    expect(run("env FOO=bar cat /outside/x")).toEqual(["/outside/x"]);
    expect(run('cat "/outside/a b.md"')).toEqual(["/outside/a b.md"]);
    expect(run("cd sub && cat /outside/x | grep y")).toEqual(["/outside/x"]);
  });

  it("dedupes repeated resolved paths", () => {
    expect(run("cat /outside/x /outside/x")).toEqual(["/outside/x"]);
  });

  it("returns [] without a project root", () => {
    expect(extractOutsideProjectPathArgs("cat /outside/x", ROOT, null)).toEqual([]);
    expect(extractOutsideProjectPathArgs("", ROOT, ROOT)).toEqual([]);
  });

  it("flags windows-style absolute paths outside the project", () => {
    expect(run("cat C:\\outside\\x.md")).toEqual(["C:\\outside\\x.md"]);
  });
});
