import { useState, useEffect, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";
import {
  loadProjectTemplate,
  type ProjectTemplateState,
} from "@/lib/templates/project-template-state";

export function useProjectTemplate() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [state, setState] = useState<ProjectTemplateState | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectRoot) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const loaded = await loadProjectTemplate(projectRoot);
      setState(loaded);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, loading, reload, setState };
}
