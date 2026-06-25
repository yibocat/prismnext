import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadProjectTemplate,
  saveProjectTemplate,
} from "@/lib/templates/project-template-state";

describe("project-template-state", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      electronAPI: {
        fsExists: vi.fn(),
        fsRead: vi.fn(),
        fsWrite: vi.fn(),
      },
    });
  });

  it("loadProjectTemplate returns null when settings missing", async () => {
    vi.mocked(window.electronAPI.fsExists).mockResolvedValue(false);
    const result = await loadProjectTemplate("/proj");
    expect(result).toBeNull();
  });

  it("loadProjectTemplate parses valid template block", async () => {
    vi.mocked(window.electronAPI.fsExists).mockResolvedValue(true);
    vi.mocked(window.electronAPI.fsRead).mockResolvedValue({
      content: JSON.stringify({
        template: {
          id: "academic-paper",
          category: "paper",
          appliedAt: "2026-01-01T00:00:00.000Z",
          appliedFiles: { "main.tex": "sha256:abc" },
        },
      }),
    });
    const result = await loadProjectTemplate("/proj");
    expect(result).toEqual({
      id: "academic-paper",
      category: "paper",
      appliedAt: "2026-01-01T00:00:00.000Z",
      appliedFiles: { "main.tex": "sha256:abc" },
    });
  });

  it("saveProjectTemplate merges into existing settings", async () => {
    vi.mocked(window.electronAPI.fsExists).mockResolvedValue(true);
    vi.mocked(window.electronAPI.fsRead).mockResolvedValue({
      content: JSON.stringify({ compilerBackend: "tectonic" }),
    });
    vi.mocked(window.electronAPI.fsWrite).mockResolvedValue(undefined);

    await saveProjectTemplate("/proj", {
      id: "phd-thesis",
      category: "thesis",
      appliedAt: "2026-06-23T00:00:00.000Z",
      appliedFiles: {},
    });

    expect(window.electronAPI.fsWrite).toHaveBeenCalledWith(
      "/proj/.prismnext/settings.json",
      expect.stringContaining('"phd-thesis"'),
    );
    const written = vi.mocked(window.electronAPI.fsWrite).mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.compilerBackend).toBe("tectonic");
    expect(parsed.template.id).toBe("phd-thesis");
  });
});
