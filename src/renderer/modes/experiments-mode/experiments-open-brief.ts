/**
 * Open the project Research Brief as a Files editor tab
 * (`.brief.md`) — workspace surface, not Settings.
 */
import { openResearchBrief } from "@/lib/files/open-research-brief";
import { getExperimentProjectRoot } from "./experiments-project-root";
import { useDocumentStore } from "@/stores/document-store";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";

export async function openExperimentResearchBrief(focusSection?: string): Promise<void> {
  const projectRoot =
    getExperimentProjectRoot() ?? useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    toast.error(i18n.t("experiments.empty.openProject"));
    return;
  }
  await openResearchBrief({ focusSection });
}
