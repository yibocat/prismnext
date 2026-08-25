/**
 * Open the project Research Brief (`.brief.md`) as a Files editor tab —
 * workspace surface; hidden from the file tree.
 */
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { researchDesktop } from "@/lib/desktop-api/research";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import {
  RESEARCH_BRIEF_REL,
  findResearchBriefHeadingLine,
  resolveResearchBriefSection,
} from "../../../shared/research/brief";

export async function ensureResearchBrief(projectRoot: string) {
  return researchDesktop.researchBriefEnsure(projectRoot);
}

export async function readResearchBrief(projectRoot: string) {
  await researchDesktop.researchBriefEnsure(projectRoot);
  return researchDesktop.researchBriefRead(projectRoot);
}

export async function openResearchBrief(options?: {
  focusSection?: string;
  /** Leave Settings nav and close the settings detail panel before opening. */
  leaveSettings?: boolean;
}): Promise<boolean> {
  if (options?.leaveSettings) {
    useLayoutStore.getState().setLeftSidebarView("sessions");
    closeSettingsPanel();
  }

  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    toast.error(i18n.t("experiments.empty.openProject"));
    return false;
  }

  try {
    await ensureResearchBrief(projectRoot);
  } catch {
    toast.error(i18n.t("experiments.brief.openFailed"));
    return false;
  }

  const ok = await openProjectFileFromChat(RESEARCH_BRIEF_REL, { pin: true });
  if (!ok) {
    toast.error(i18n.t("experiments.brief.openFailed"));
    return false;
  }

  const section = options?.focusSection
    ? resolveResearchBriefSection(options.focusSection)
    : null;
  if (!section) return true;

  try {
    const brief = await researchDesktop.researchBriefRead(projectRoot);
    const line = findResearchBriefHeadingLine(brief.raw ?? "", section);
    if (line == null) return true;
    window.setTimeout(() => {
      useDocumentStore.getState().requestJumpToLine(RESEARCH_BRIEF_REL, line);
    }, 80);
  } catch {
    // File is open; skipping jump is fine.
  }
  return true;
}
