// prism-next/src/main/prompts/modules/workspace-folders.ts

import type { WorkspaceFolder } from "../../../renderer/types/workspace";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
} from "../../../renderer/types/workspace";

/** Build the prompt section describing functional workspace folders. */
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

    // Include mainTex info for manuscript folders
    const extra =
      d.function === "manuscript" && "mainTex" in d
        ? ` (main file: \`${(d as any).mainTex}\`)`
        : "";

    return `- \`${d.name}/\` ${icon} **${label}**${extra}: ${desc}`;
  });

  return (
    "## Project Structure\n\n" +
    "The project has the following functional folders. " +
    "Use this structure to organize files and understand the project layout:\n\n" +
    lines.join("\n") +
    (dirs.some((d) => d.function === "experiment")
      ? ""
      : "\n\n- No `experiment/` folder is configured in Workspace settings. " +
        "Experiment islands and run logs are unavailable until the user adds an Experiment folder " +
        "(Settings → Workspace → Add folder → function: Experiment). Do not create experiment " +
        "structure in the manuscript folder or project root.")
  );
}
