import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Root-currency guard: async tree writers must discard results when the user
 * switched projects while the scan/read was in flight — otherwise a slow
 * LOCAL scan lands after focusing a REMOTE project (or vice versa) and the
 * Files tree shows the wrong project's files.
 */

const scanCalls: Array<{ rootPath: string; resolve: (v: unknown) => void }> = [];

vi.stubGlobal("window", {
  electronAPI: {
    // NOTE: document-store calls fsDesktop.fsScanMetadata(checkoutRoot) with a
    // bare string — the preload wrapper is what builds { rootPath }.
    fsScanMetadata: vi.fn((rootPath: string) => {
      if (rootPath === "/proj-two") {
        return Promise.resolve({
          files: [
            { relativePath: "two.tex", absolutePath: "/proj-two/two.tex", type: "tex", fileSize: 1 },
          ],
          folders: [],
        });
      }
      return new Promise((resolve) => {
        scanCalls.push({
          rootPath,
          resolve: () =>
            resolve({
              files: [
                { relativePath: "one.tex", absolutePath: "/proj-one/one.tex", type: "tex", fileSize: 1 },
              ],
              folders: [],
            }),
        });
      });
    }),
    fsExists: vi.fn().mockResolvedValue(true),
    fsRead: vi.fn(
      () => new Promise(() => undefined), // never settles unless overridden per-test
    ),
    fsReadImage: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64," }),
    workbenchGetState: vi.fn().mockResolvedValue({ defaultLastPath: "" }),
    projectOpen: vi.fn().mockResolvedValue({ rootPath: "/proj-one" }),
    projectActivate: vi.fn().mockResolvedValue({}),
  },
});

import { useDocumentStore } from "../../src/renderer/stores/document-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";

function seedProjectOne() {
  useDocumentStore.setState({
    projectRoot: "/proj-one",
    checkoutRoot: "/proj-one",
    initialized: true,
    files: [
      { id: "one.tex", name: "one.tex", relativePath: "one.tex", absolutePath: "/proj-one/one.tex", type: "tex" },
    ],
    folders: [],
    fileMetadata: new Map(),
    openedContents: new Map(),
  });
}

function fileIds(): string[] {
  return useDocumentStore.getState().files.map((f) => f.relativePath);
}

describe("document-store root-generation guard", () => {
  beforeEach(() => {
    scanCalls.length = 0;
    vi.clearAllMocks();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    seedProjectOne();
  });

  it("stale in-flight scan for the OLD root cannot overwrite the NEW root's tree", async () => {
    // 1. A slow local rescan starts while /proj-one is focused.
    const stale = useDocumentStore.getState().reloadMetadataFromDisk(true);
    await vi.waitFor(() => expect(scanCalls.length).toBe(1));

    // 2. User switches to /proj-two (bumps the root generation; its own scan
    //    resolves immediately with /proj-two's files).
    await useDocumentStore.getState().switchCheckoutRoot("/proj-two");
    expect(useDocumentStore.getState().checkoutRoot).toBe("/proj-two");
    expect(fileIds()).toEqual(["two.tex"]);

    // 3. The pre-switch scan finally lands — it must be discarded.
    scanCalls[0]!.resolve(undefined);
    await stale;

    expect(fileIds()).toEqual(["two.tex"]);
    expect(useDocumentStore.getState().checkoutRoot).toBe("/proj-two");
  });

  it("pending content re-read for the old root cannot land in the new root's cache", async () => {
    // Clean open file on /proj-one whose re-read is triggered by a watcher event.
    useDocumentStore.setState({
      openedContents: new Map([["one.tex", { content: "original", isDirty: false }]]),
    });

    // Deferred fsRead — capture the promise we can settle later.
    let releaseRead: ((v: { content: string }) => void) | null = null;
    const { electronAPI } = window as unknown as {
      electronAPI: { fsRead: ReturnType<typeof vi.fn> };
    };
    electronAPI.fsRead.mockImplementationOnce(
      () => new Promise<{ content: string }>((resolve) => (releaseRead = resolve)),
    );

    const changed = useDocumentStore.getState().incrementalFileChanged(["/proj-one/one.tex"]);

    // Switch projects mid-read; switchCheckoutRoot clears the content cache.
    await useDocumentStore.getState().switchCheckoutRoot("/proj-two");
    expect(useDocumentStore.getState().openedContents.size).toBe(0);

    // The stale read resolves — the guard must drop it.
    releaseRead?.({ content: "STALE FROM PROJ ONE" });
    await changed;

    expect(useDocumentStore.getState().openedContents.size).toBe(0);
  });

  it("a scan started for the CURRENT root still lands when nothing supersedes it", async () => {
    const reload = useDocumentStore.getState().reloadMetadataFromDisk(true);
    await vi.waitFor(() => expect(scanCalls.length).toBe(1));
    scanCalls[0]!.resolve(undefined);
    await reload;
    expect(fileIds()).toEqual(["one.tex"]);
  });
});
