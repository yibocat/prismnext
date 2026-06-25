import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterRecentForDisplay,
  getRecentOpenedFilesForProject,
  getProjectLastActiveFileId,
} from "../../src/renderer/lib/files/project-scoped-files";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";
import { useDocumentStore } from "../../src/renderer/stores/document-store";
import { externalFileId } from "../../src/renderer/lib/files/external-file";

const PROJECT_A = "/Users/test/project-a";
const PROJECT_B = "/Users/test/project-b";

describe("project-scoped recent files", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        recentOpenedFilesByProject: {
          [PROJECT_A]: [
            { id: "main.tex", name: "main.tex", lastOpened: 1 },
            { id: "notes/chapter.tex", name: "chapter.tex", lastOpened: 2 },
          ],
          [PROJECT_B]: [{ id: "main.tex", name: "main.tex", lastOpened: 3 }],
        },
        lastActiveFileIdByProject: {
          [PROJECT_A]: "notes/chapter.tex",
          [PROJECT_B]: "readme.md",
        },
      },
      loaded: true,
    });
    useDocumentStore.setState({ projectRoot: PROJECT_B });
    vi.stubGlobal("electronAPI", undefined);
  });

  it("returns only recent files for the requested project", () => {
    expect(getRecentOpenedFilesForProject(PROJECT_A)).toHaveLength(2);
    expect(getRecentOpenedFilesForProject(PROJECT_B)).toHaveLength(1);
    expect(getRecentOpenedFilesForProject(null)).toEqual([]);
  });

  it("does not show same relative path from another project when metadata differs", () => {
    const metadataB = new Map([
      ["readme.md", { relativePath: "readme.md", absolutePath: `${PROJECT_B}/readme.md`, name: "readme.md", type: "other" as const }],
    ]);
    const recentB = getRecentOpenedFilesForProject(PROJECT_B);
    const visible = filterRecentForDisplay(recentB, metadataB, PROJECT_B);
    // main.tex is in recent for B but not in B's metadata — must be hidden
    expect(visible).toEqual([]);
  });

  it("shows project-relative entries only when present in current metadata", () => {
    const metadataB = new Map([
      ["main.tex", { relativePath: "main.tex", absolutePath: `${PROJECT_B}/main.tex`, name: "main.tex", type: "tex" as const }],
    ]);
    const recentB = getRecentOpenedFilesForProject(PROJECT_B);
    const visible = filterRecentForDisplay(recentB, metadataB, PROJECT_B);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("main.tex");
  });

  it("hides external files outside the current project root", () => {
    const otherAbs = `${PROJECT_A}/outside.md`;
    const ownAbs = `${PROJECT_B}/inside.md`;
    const entries = [
      { id: externalFileId(otherAbs), name: "outside.md", lastOpened: 1 },
      { id: externalFileId(ownAbs), name: "inside.md", lastOpened: 2 },
    ];
    const visible = filterRecentForDisplay(entries, new Map(), PROJECT_B);
    expect(visible.map((e) => e.name)).toEqual(["inside.md"]);
  });

  it("reads last active file per project", () => {
    expect(getProjectLastActiveFileId(PROJECT_A)).toBe("notes/chapter.tex");
    expect(getProjectLastActiveFileId(PROJECT_B)).toBe("readme.md");
  });
});
