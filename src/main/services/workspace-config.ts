import * as path from "node:path";
import * as fs from "node:fs";
import type { WorkspaceFolder } from "../../renderer/types/workspace";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
} from "../../renderer/types/workspace";

interface ProjectSettings {
  version?: number;
  compiler?: string;
  workspaceDirs?: WorkspaceFolder[];
  [key: string]: unknown;
}

function getSettingsPath(prismDir: string): string {
  return path.join(prismDir, "settings.json");
}

function readProjectSettings(prismDir: string): ProjectSettings {
  const settingsPath = getSettingsPath(prismDir);
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeProjectSettings(prismDir: string, settings: ProjectSettings): void {
  const settingsPath = getSettingsPath(prismDir);
  // Ensure the .prismnext directory exists before writing
  if (!fs.existsSync(prismDir)) {
    fs.mkdirSync(prismDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

export function readWorkspaceDirs(prismDir: string): WorkspaceFolder[] {
  const settings = readProjectSettings(prismDir);

  if (Array.isArray(settings.workspaceDirs)) {
    // Return as-is — even empty array means user explicitly removed all folders
    if (settings.workspaceDirs.length > 0) {
      return settings.workspaceDirs;
    }
    return [];
  }

  // Migrate from old format: { manuscript: { dir, main } }
  const oldManuscript = settings.manuscript as
    | { dir?: string; main?: string }
    | undefined;
  if (oldManuscript?.dir) {
    const migrated: WorkspaceFolder[] = [
      {
        function: "manuscript",
        name: oldManuscript.dir,
        mainTex: oldManuscript.main || "main.tex",
      },
    ];
    // Write back in the new format so migration only happens once
    settings.workspaceDirs = migrated;
    writeProjectSettings(prismDir, settings);
    return migrated;
  }

  // Default — no workspaceDirs key at all (fresh project)
  return [{ function: "manuscript", name: "manuscript", mainTex: "main.tex" }];
}

export function writeWorkspaceDirs(
  prismDir: string,
  dirs: WorkspaceFolder[],
): void {
  const settings = readProjectSettings(prismDir);
  settings.workspaceDirs = dirs;
  writeProjectSettings(prismDir, settings);
}

export function validateWorkspaceDirs(dirs: WorkspaceFolder[]): string[] {
  const errors: string[] = [];

  // Check duplicate names
  const names = new Set<string>();
  for (const d of dirs) {
    if (names.has(d.name)) {
      errors.push(`Duplicate folder name: "${d.name}"`);
    }
    names.add(d.name);
  }

  // Check for invalid folder names
  for (const d of dirs) {
    if (!d.name || !d.name.trim()) {
      errors.push("Folder name cannot be empty.");
    } else if (d.name.includes("/") || d.name.includes("\\")) {
      errors.push(`Folder name "${d.name}" cannot contain path separators.`);
    } else if (d.name === "." || d.name === "..") {
      errors.push(`Folder name "${d.name}" is reserved.`);
    }
  }

  // Check at most one manuscript
  const manuscriptCount = dirs.filter((d) => d.function === "manuscript").length;
  if (manuscriptCount > 1) {
    errors.push("Only one manuscript folder is allowed.");
  }

  // Check manuscript has mainTex
  for (const d of dirs) {
    if (d.function === "manuscript" && !("mainTex" in d && d.mainTex)) {
      errors.push(`Manuscript folder "${d.name}" must specify mainTex.`);
    }
  }

  return errors;
}

export function createConfiguredFolders(
  projectRoot: string,
  dirs: WorkspaceFolder[],
): { created: string[]; errors: { folder: string; error: string }[] } {
  const created: string[] = [];
  const diskErrors: { folder: string; error: string }[] = [];

  for (const d of dirs) {
    const absPath = path.join(projectRoot, d.name);
    try {
      if (!fs.existsSync(absPath)) {
        fs.mkdirSync(absPath, { recursive: true });
        created.push(d.name);
      }
    } catch (e: any) {
      diskErrors.push({ folder: d.name, error: e.message });
    }
  }

  return { created, errors: diskErrors };
}

/** Build AI-readable summary of workspace folders */
export function buildWorkspaceSummary(dirs: WorkspaceFolder[]): string {
  return dirs
    .map((d) => {
      const icon = FOLDER_FUNCTION_ICONS[d.function] || "";
      const label =
        d.function === "custom" && "customLabel" in d
          ? (d as import("../../renderer/types/workspace").CustomFolder).customLabel ||
            FOLDER_FUNCTION_LABELS.custom
          : FOLDER_FUNCTION_LABELS[d.function];
      const desc =
        d.description ||
        DEFAULT_FUNCTION_DESCRIPTIONS[d.function] ||
        "User-defined folder";
      return `- \`${d.name}/\` ${icon} **${label}**: ${desc}`;
    })
    .join("\n");
}
