/**
 * Edit-project flow — UI talks to this module, this module talks to desktop-api.
 */
import { fsDesktop } from "@/lib/desktop-api/fs";
import { useWorkbenchStore } from "@/stores/workbench-store";

export type EditProjectDraft = {
  folderExists: boolean;
};

async function pathExists(absPath: string): Promise<boolean> {
  try {
    return await fsDesktop.fsExists(absPath);
  } catch {
    return false;
  }
}

export async function loadEditProjectDraft(lastPath: string): Promise<EditProjectDraft> {
  return { folderExists: await pathExists(lastPath) };
}

export async function saveEditProject(input: {
  projectId: string;
  displayName: string;
}): Promise<void> {
  const name = input.displayName.trim();
  if (!name) throw new Error("missing_display_name");
  await useWorkbenchStore.getState().updateDisplayName(input.projectId, name);
}
