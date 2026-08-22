import { ipcMain } from "electron";
import { RESEARCH_BRIEF_REL } from "../../shared/research/brief";
import {
  ensureResearchBrief,
  readResearchBrief,
  researchBriefAbsPath,
  updateResearchBriefSection,
} from "../services/research-brief-service";

export function registerResearchBriefHandlers(): void {
  ipcMain.handle("researchBrief:ensure", async (_event, args: { projectRoot: string }) => {
    const result = ensureResearchBrief(args.projectRoot);
    return { success: true, ...result };
  });

  ipcMain.handle("researchBrief:read", async (_event, args: { projectRoot: string }) => {
    return readResearchBrief(args.projectRoot, { ensure: true });
  });

  ipcMain.handle(
    "researchBrief:updateSection",
    async (
      _event,
      args: { projectRoot: string; section: string; content: string; append?: boolean },
    ) => {
      return updateResearchBriefSection(args.projectRoot, args.section, args.content, {
        append: args.append,
      });
    },
  );

  ipcMain.handle("researchBrief:getPath", async (_event, args: { projectRoot: string }) => {
    ensureResearchBrief(args.projectRoot);
    return {
      relativePath: RESEARCH_BRIEF_REL,
      absolutePath: researchBriefAbsPath(args.projectRoot),
    };
  });
}
