import { useCallback } from "react";
import { confirmProjectScaffold } from "@/lib/workspace/project-lifecycle";

export function useProjectOpen() {
  return useCallback((path: string) => confirmProjectScaffold(path), []);
}
