import { useCallback } from "react";
import { projectDesktop } from "@/lib/desktop-api/project";
import { useProjectDialogStore } from "@/stores/project-dialog-store";

export function useProjectOpen() {
  return useCallback(async (path: string): Promise<boolean> => {
    const check = await projectDesktop.projectCheck(path);
    if (check.missing.length > 0) {
      const result = await useProjectDialogStore.getState().show(path, check.missing);
      if (result === "cancel") return false;
      if (result === "create") {
        await projectDesktop.projectCreate(path);
      }
    }
    return true;
  }, []);
}
