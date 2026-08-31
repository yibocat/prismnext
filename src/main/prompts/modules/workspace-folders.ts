// prism-next/src/main/prompts/modules/workspace-folders.ts

import type { WorkspaceFolder } from "../../../shared/workbench/workspace-folder";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  manuscriptMainFile,
} from "../../../shared/workbench/workspace-folder";

/** stableSystem block 1.4 — dynamic folder map from Workspace settings. */
export function buildWorkspacePrompt(dirs: WorkspaceFolder[]): string {
  if (!dirs || dirs.length === 0) return "";

  const lines = dirs.map((d) => {
    const label =
      d.function === "custom" && "customLabel" in d
        ? (d as any).customLabel || FOLDER_FUNCTION_LABELS.custom
        : FOLDER_FUNCTION_LABELS[d.function];

    const desc =
      d.description ||
      DEFAULT_FUNCTION_DESCRIPTIONS[d.function] ||
      "User-defined folder";

    const icon = FOLDER_FUNCTION_ICONS[d.function] || "";

    const pin =
      d.function === "manuscript" ? manuscriptMainFile(d) : undefined;
    const extra = pin ? ` (optional compile entry: \`${pin}\`)` : "";

    return `- \`${d.name}/\` ${icon} **${label}**${extra}: ${desc}`;
  });

  return (
    "## Project workspace\n\n" +
    "PrismNext is **local-first**: this project folder holds the research tree. " +
    "Chat is for thinking together; **files here are the durable record** when chat and disk diverge.\n\n" +
    "Functional folders configured for this project:\n\n" +
    lines.join("\n") +
    (dirs.some((d) => d.function === "experiment")
      ? ""
      : "\n\n- No Experiment folder is configured. Experiment tools stay unavailable until the user adds one " +
        "(Settings → Workspace → Add folder → Experiment). Do not invent experiment layout under manuscript or root.")
  );
}
