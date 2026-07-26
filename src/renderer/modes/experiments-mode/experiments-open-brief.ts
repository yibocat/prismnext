/**
 * Open the project Research Brief as a Files editor tab
 * (`.prismnext/research/brief.md`) — workspace surface, not Settings.
 */
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";
import { useDocumentStore } from "@/stores/document-store";
import {
  RESEARCH_BRIEF_REL,
  findResearchBriefHeadingLine,
  resolveResearchBriefSection,
} from "../../../shared/research-brief";
import { getExperimentProjectRoot } from "./experiments-project-root";

export async function openExperimentResearchBrief(focusSection?: string): Promise<void> {
  const projectRoot =
    getExperimentProjectRoot() ?? useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    toast.error(i18n.t("experiments.empty.openProject"));
    return;
  }

  try {
    await window.electronAPI.researchBriefEnsure(projectRoot);
  } catch {
    toast.error(i18n.t("experiments.brief.openFailed"));
    return;
  }

  const ok = await openProjectFileFromChat(RESEARCH_BRIEF_REL, { pin: true });
  if (!ok) {
    toast.error(i18n.t("experiments.brief.openFailed"));
    return;
  }

  const section = focusSection ? resolveResearchBriefSection(focusSection) : null;
  if (!section) return;

  try {
    const brief = await window.electronAPI.researchBriefRead(projectRoot);
    const line = findResearchBriefHeadingLine(brief.raw ?? "", section);
    if (line == null) return;
    window.setTimeout(() => {
      useDocumentStore.getState().requestJumpToLine(RESEARCH_BRIEF_REL, line);
    }, 80);
  } catch {
    // File is open; skipping jump is fine.
  }
}
