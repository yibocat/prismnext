import { useEffect } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { bumpSkillsRefresh } from "@/lib/settings/skills-refresh";

/** Reload skills lists when main process syncs OpenCode integration (watcher / agent write). */
export function useSkillsIntegrationEvents(): void {
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSkillsIntegrationChanged(({ projectPath }) => {
      if (!projectRoot || projectPath !== projectRoot) return;
      bumpSkillsRefresh();
    });
    return unsubscribe;
  }, [projectRoot]);
}
