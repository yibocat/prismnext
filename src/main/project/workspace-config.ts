import * as path from "node:path";
import * as fs from "node:fs";
import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  findExperimentConfig,
} from "../../shared/workbench/workspace-folder";
import {
  readWorkbenchJson,
  writeWorkbenchJson,
  ensureWorkbenchId,
} from "../workbench/identity";
import { DEFAULT_WORKSPACE_FOLDERS, readWorkspaceDirs } from "../lib/workspace-dirs";

export { DEFAULT_WORKSPACE_FOLDERS, readWorkspaceDirs };

interface ProjectSettings {
  version?: number;
  compiler?: string;
  workspaceDirs?: WorkspaceFolder[];
  [key: string]: unknown;
}

function getSettingsPath(metaDir: string): string {
  return path.join(metaDir, "settings.json");
}

function readProjectSettings(metaDir: string): ProjectSettings {
  const settingsPath = getSettingsPath(metaDir);
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeProjectSettings(metaDir: string, settings: ProjectSettings): void {
  const settingsPath = getSettingsPath(metaDir);
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

export function writeWorkspaceDirs(
  projectRoot: string,
  dirs: WorkspaceFolder[],
): void {
  // Guard against the data-loss signature: never persist an empty folder list.
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return;
  }
  const existing = readWorkbenchJson(projectRoot);
  const id = existing?.id ?? ensureWorkbenchId(projectRoot);
  writeWorkbenchJson(projectRoot, {
    id,
    workspace: {
      ...existing?.workspace,
      folders: dirs,
    },
  });
}

export function validateWorkspaceDirs(dirs: WorkspaceFolder[]): string[] {
  const errors: string[] = [];

  // Reject empty - a project must keep at least one workspace folder. This is
  // the data-loss guardrail: autosave cleanup during project switch used to read
  // a reset (empty) store and overwrite the old project's settings.json with [],
  // permanently losing notes/literature/experiments. Even though the autosave
  // hook now snapshots, this server-side check stops any other path from
  // writing an empty array. To remove all folders the user edits in the dialog
  // and saves via a code path that bypasses validation; that's acceptable - the
  // realistic intent is always "keep at least the manuscript".
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return ["At least one workspace folder is required."];
  }

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

export interface LiteratureProjectConfig {
  zoteroCollectionId?: string;
  zoteroCollectionName?: string;
}

export function readLiteratureProjectConfig(prismDir: string): LiteratureProjectConfig {
  const settings = readProjectSettings(prismDir);
  const literature = settings.literature as LiteratureProjectConfig | undefined;
  if (!literature || typeof literature !== "object") return {};
  return {
    zoteroCollectionId:
      typeof literature.zoteroCollectionId === "string" ? literature.zoteroCollectionId : undefined,
    zoteroCollectionName:
      typeof literature.zoteroCollectionName === "string" ? literature.zoteroCollectionName : undefined,
  };
}

export function writeLiteratureProjectConfig(
  prismDir: string,
  patch: Partial<LiteratureProjectConfig> & {
    zoteroCollectionId?: string | null;
    zoteroCollectionName?: string | null;
  },
): LiteratureProjectConfig {
  const settings = readProjectSettings(prismDir);
  const current = readLiteratureProjectConfig(prismDir);
  const next: LiteratureProjectConfig = { ...current };

  if ("zoteroCollectionId" in patch) {
    if (patch.zoteroCollectionId) next.zoteroCollectionId = patch.zoteroCollectionId;
    else delete next.zoteroCollectionId;
  }
  if ("zoteroCollectionName" in patch) {
    if (patch.zoteroCollectionName) next.zoteroCollectionName = patch.zoteroCollectionName;
    else delete next.zoteroCollectionName;
  }

  if (Object.keys(next).length === 0) {
    delete settings.literature;
  } else {
    settings.literature = next;
  }
  writeProjectSettings(prismDir, settings);
  return next;
}

/**
 * Resolve the Workspace-configured experiment folder.
 *
 * Experiment is opt-in (not in `defaultWorkspaceDirs`), so absence is the
 * expected state and MUST propagate as `{ error: "not_configured" }` — callers
 * (experiment-log / experiment-run) return a `no_experiment_folder` error and
 * the `experiments` module guides the user to add an Experiment folder in
 * Workspace settings. Never auto-creates a folder.
 */
export function resolveExperimentDir(
  projectRoot: string,
  _prismDir?: string,
): { rel: string; abs: string } | { error: "not_configured" } {
  const dirs = readWorkspaceDirs(projectRoot);
  const exp = findExperimentConfig(dirs);
  if (!exp) return { error: "not_configured" };
  const root = projectRoot.replace(/\\/g, "/");
  return { rel: exp.dir, abs: path.join(root, exp.dir) };
}
