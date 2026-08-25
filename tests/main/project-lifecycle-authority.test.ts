import { describe, expect, it } from "vitest";
import {
  ProjectLifecycleAuthority,
  type ProjectLifecycleFs,
} from "../../src/main/project/project-lifecycle-authority";

const home = "/fake-home";
const project = `${home}/research`;
const projectAlias = `${home}/research-link`;

function authorityWith(
  paths: Record<string, { realpath: string; directory?: boolean }>,
): ProjectLifecycleAuthority {
  const fs: ProjectLifecycleFs = {
    realpath: async (path) => {
      const result = paths[path];
      if (!result) throw new Error(`ENOENT: ${path}`);
      return result.realpath;
    },
    stat: async (path) => ({
      isDirectory: () => paths[path]?.directory ?? true,
    }),
  };
  return new ProjectLifecycleAuthority({ homeDir: home, fs });
}

describe("project lifecycle authority", () => {
  it("authorizes an existing directory as its canonical home-contained root", async () => {
    const authority = authorityWith({
      [home]: { realpath: home },
      [projectAlias]: { realpath: project },
      [project]: { realpath: project, directory: true },
    });

    await expect(authority.open(projectAlias)).resolves.toEqual({
      rootPath: project,
      previousRoot: null,
      changed: true,
    });
    expect(authority.currentRoot).toBe(project);
  });

  it("rejects a home symlink whose canonical target is outside home", async () => {
    const authority = authorityWith({
      [home]: { realpath: home },
      [`${home}/system-link`]: { realpath: "/System/Library" },
      "/System/Library": { realpath: "/System/Library", directory: true },
    });

    await expect(authority.open(`${home}/system-link`)).rejects.toThrow(
      /outside the user home/,
    );
    expect(authority.currentRoot).toBeNull();
  });

  it("rejects missing paths and non-directory roots", async () => {
    const authority = authorityWith({
      [home]: { realpath: home },
      [`${home}/file`]: { realpath: `${home}/file`, directory: false },
    });

    await expect(authority.open(`${home}/missing`)).rejects.toThrow(/missing/);
    await expect(authority.open(`${home}/file`)).rejects.toThrow(/directory/);
  });

  it("treats equivalent symlink roots as the same active project", async () => {
    const authority = authorityWith({
      [home]: { realpath: home },
      [projectAlias]: { realpath: project },
      [project]: { realpath: project, directory: true },
    });

    await authority.open(projectAlias);
    await expect(authority.open(project)).resolves.toEqual({
      rootPath: project,
      previousRoot: project,
      changed: false,
    });
  });
});
