import { openProjectFileFromChat } from "@/lib/files/open-project-file";
import {
  openPaperInMainLibrary,
  openPaperPdfReader,
} from "@/lib/literature/open-paper-in-library";
import { paperHasReadablePdf } from "@/lib/literature/literature-format";
import { openExperimentInPanel } from "@/modes/experiments-mode/open-experiment";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";

/** Open a @file token — expand RightArea and focus the project file. */
export function openComposerFileToken(
  filePath: string,
  opts?: { line?: number; pin?: boolean },
): void {
  const path = filePath.trim();
  if (!path) return;
  void openProjectFileFromChat(path, opts);
}

/** Open a @paper token — PDF reader when available, else library list detail. */
export async function openComposerPaperToken(paperId: string): Promise<void> {
  const id = paperId.trim();
  if (!id) return;

  const projectRoot = useDocumentStore.getState().projectRoot;
  const litStore = useLiteratureStore.getState();
  if (projectRoot && !litStore.papers.some((p) => p.id === id)) {
    await litStore.refresh(projectRoot);
  }

  const paper = useLiteratureStore.getState().papers.find((p) => p.id === id);
  if (!paper) {
    openPaperInMainLibrary(id);
    return;
  }
  if (paperHasReadablePdf(paper)) {
    openPaperPdfReader(paper.id, paper.title ?? paper.bibkey);
  } else {
    openPaperInMainLibrary(paper.id);
  }
}

/** Open a @experiment token — expand RightArea Experiments and select the island. */
export function openComposerExperimentToken(experimentId: string): void {
  const id = experimentId.trim();
  if (!id) return;
  void openExperimentInPanel(id);
}
