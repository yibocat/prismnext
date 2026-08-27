import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchSshHostInput } from "../../src/renderer/lib/remote/ssh-host-picker";
import {
  listLocalRepoEntries,
  listRemoteRepoEntries,
  listUnifiedRecents,
} from "../../src/renderer/lib/workspace/unified-project-picker";

const recents = [
  { path: "/Users/me/local-paper", name: "local-paper", lastOpened: 20 },
  { path: "remote://43.167.215.144/home/u/project-test-1", name: "project-test-1", lastOpened: 10 },
];

describe("listUnifiedRecents", () => {
  it("keeps local and remote recents in one list", () => {
    const rows = listUnifiedRecents({
      recentProjects: recents,
      memberPaths: [],
      defaultProject: null,
      query: "",
    });
    expect(rows.map((row) => row.path)).toEqual([
      "/Users/me/local-paper",
      "remote://43.167.215.144/home/u/project-test-1",
    ]);
    expect(rows[0]?.kind).toBe("local");
    expect(rows[1]?.kind).toBe("remote");
  });

  it("shows the remote profile on the trailing side", () => {
    const remote = listUnifiedRecents({
      recentProjects: recents,
      memberPaths: [],
      defaultProject: null,
      query: "",
    }).find((row) => row.kind === "remote");
    expect(remote?.trailing).toBe("43.167.215.144");
    expect(remote?.name).toBe("project-test-1");
  });

  it("filters a remote recent by IP / alias", () => {
    const rows = listUnifiedRecents({
      recentProjects: recents,
      memberPaths: [],
      defaultProject: null,
      query: "43.167",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("remote");
  });

  it("marks a workbench member as already on the bench", () => {
    const rows = listUnifiedRecents({
      recentProjects: recents,
      memberPaths: ["remote://43.167.215.144/home/u/project-test-1"],
      defaultProject: null,
      query: "",
    });
    expect(rows.find((row) => row.kind === "remote")?.onWorkbench).toBe(true);
    expect(rows.find((row) => row.kind === "local")?.onWorkbench).toBe(false);
  });
});

describe("listLocalRepoEntries / listRemoteRepoEntries", () => {
  const members = [
    { lastPath: "/Users/me/local-paper", displayName: "Local Paper" },
    { lastPath: "remote://lab/home/u/b", displayName: "Remote B" },
  ];

  it("lists only local workbench members", () => {
    expect(listLocalRepoEntries(members, "")).toEqual([
      {
        path: "/Users/me/local-paper",
        name: "Local Paper",
        description: "/Users/me/local-paper",
      },
    ]);
  });

  it("lists remote members and recents for one host", () => {
    const rows = listRemoteRepoEntries(
      "lab",
      members,
      [{ path: "remote://lab/home/u/notes", name: "notes" }],
      "",
    );
    expect(rows.map((row) => row.path)).toEqual([
      "remote://lab/home/u/b",
      "remote://lab/home/u/notes",
    ]);
    expect(rows[0]?.description).toBe("/home/u/b");
  });
});

describe("matchSshHostInput", () => {
  const hosts = [
    { alias: "lab", hostname: "43.167.215.144" },
    { alias: "gpu", hostname: "hz-4.matpool.com" },
  ];

  it("matches alias, hostname, or user@host", () => {
    expect(matchSshHostInput("lab", hosts)).toEqual({ alias: "lab" });
    expect(matchSshHostInput("43.167.215.144", hosts)).toEqual({ alias: "lab" });
    expect(matchSshHostInput("ubuntu@hz-4.matpool.com", hosts)).toEqual({ alias: "gpu" });
  });

  it("returns unmatched when the host is not in SSH config", () => {
    expect(matchSshHostInput("unknown", hosts)).toEqual({ unmatched: "unknown" });
  });
});

describe("RW-6.1 picker wiring", () => {
  const menu = readFileSync(
    join(__dirname, "../../src/renderer/components/layout/workbench-add-menu.tsx"),
    "utf8",
  );
  const repos = readFileSync(
    join(__dirname, "../../src/renderer/components/modules/project/project-picker-repos.tsx"),
    "utf8",
  );
  const ssh = readFileSync(
    join(__dirname, "../../src/renderer/components/modules/remote/ssh-host-picker-dialog.tsx"),
    "utf8",
  );

  it("uses unified recents, Repos, and the SSH picker", () => {
    expect(menu).toContain("listUnifiedRecents");
    expect(menu).toContain("ProjectPickerReposSection");
    expect(menu).toContain("SshHostPickerDialog");
    expect(menu).toContain("pickerMode");
    expect(repos).toContain("nav.workbench.localRepos");
    expect(ssh).toContain("SSH_CONFIG_REVEAL_PATH");
  });
});
