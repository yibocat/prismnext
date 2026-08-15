import {
  isResearchPlanDraftPath,
  RESEARCH_PLANS_DIR_REL,
} from "../../../shared/research-plan";
import { param } from "@/components/modules/chat/tools/shared";
import type { ContentBlock } from "@/stores/chat-store";

/** True when a write/edit tool targets a research plan markdown file. */
export function isPlanFileToolUse(toolUse: { name?: string; input?: unknown }): boolean {
  const name = (toolUse.name || "").toLowerCase();
  if (name !== "write" && name !== "edit") return false;
  const filePath =
    param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path")
    || "";
  return isResearchPlanFilePath(filePath);
}

export function isResearchPlanFilePath(filePath: string | null | undefined): boolean {
  if (!filePath?.trim()) return false;
  const normalized = filePath.replace(/\\/g, "/");
  if (isResearchPlanDraftPath(normalized)) return true;
  const dir = RESEARCH_PLANS_DIR_REL.replace(/\\/g, "/");
  return (
    normalized.includes(`/${dir}/`)
    || normalized.startsWith(`${dir}/`)
    || normalized.endsWith(`/${dir}`)
  );
}

/** Project-relative plan path from a write/edit tool, when recognizable. */
export function planPathFromToolUse(toolUse: ContentBlock): string | null {
  if (!isPlanFileToolUse(toolUse)) return null;
  const filePath =
    param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path")
    || "";
  const normalized = filePath.replace(/\\/g, "/");
  const dir = RESEARCH_PLANS_DIR_REL.replace(/\\/g, "/");
  const idx = normalized.indexOf(dir);
  if (idx >= 0) return normalized.slice(idx);
  if (isResearchPlanDraftPath(normalized)) {
    // Absolute path without project-relative prefix — keep basename under drafts/
    const draftsIdx = normalized.search(/\/drafts\/[^/]+\.md$/i);
    if (draftsIdx >= 0) {
      return `${dir}${normalized.slice(draftsIdx)}`;
    }
  }
  return null;
}
