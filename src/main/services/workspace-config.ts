import * as path from "node:path";
import * as fs from "node:fs";
import type { WorkspaceFolder } from "../../renderer/types/workspace";
import {
  FOLDER_FUNCTION_ICONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  findExperimentConfig,
} from "../../renderer/types/workspace";
import {
  ICON_IMAGE_FILENAME,
  normalizeIconSpec,
  iconSpecToJSON,
  type IconSpec,
} from "../../shared/icon-spec";

interface ProjectSettings {
  version?: number;
  compiler?: string;
  workspaceDirs?: WorkspaceFolder[];
  /** Project visual identity (emoji / lucide / image); legacy string = emoji. */
  projectIcon?: IconSpec | string;
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
    // Non-empty array: trust it (user's real configuration).
    if (settings.workspaceDirs.length > 0) {
      return settings.workspaceDirs;
    }
    // Empty array: this is the data-loss signature from a previous autosave bug
    // (project-switch cleanup overwrote settings.json with []). An empty config
    // is never a valid intent - a project needs at least a manuscript folder.
    // Fall through to default instead of returning [], so the project recovers
    // its functional folders instead of staying permanently empty.
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
  // Guard against the data-loss signature: never persist an empty folder list.
  // A project must keep at least one workspace folder (the manuscript). The
  // IPC layer (validateWorkspaceDirs) already rejects [], but writeWorkspaceDirs
  // is also called directly by migrations; this is the hard backstop.
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return;
  }
  const settings = readProjectSettings(prismDir);
  settings.workspaceDirs = dirs;
  writeProjectSettings(prismDir, settings);
}

/** Read the project's visual identity (emoji / lucide / image); null when unset. */
export function readProjectIcon(prismDir: string): IconSpec | null {
  const settings = readProjectSettings(prismDir);
  return normalizeIconSpec(settings.projectIcon);
}

function removeProjectIconImageFile(prismDir: string): void {
  const iconPath = path.join(prismDir, ICON_IMAGE_FILENAME);
  if (fs.existsSync(iconPath)) {
    try {
      fs.unlinkSync(iconPath);
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Rewrite the project's visual identity in `.prismnext/settings.json`.
 * Non-image icons also remove a leftover `icon.png`.
 */
export function writeProjectIcon(prismDir: string, icon: IconSpec | null): void {
  const normalized = normalizeIconSpec(icon);
  if (normalized?.kind === "image") {
    throw new Error("Use writeProjectIconImage to write image icons");
  }
  removeProjectIconImageFile(prismDir);
  const settings = readProjectSettings(prismDir);
  const json = iconSpecToJSON(normalized);
  if (json) settings.projectIcon = json;
  else delete settings.projectIcon;
  writeProjectSettings(prismDir, settings);
}

/** Write PNG bytes to `.prismnext/icon.png` and set projectIcon to image relative path. */
export function writeProjectIconImage(prismDir: string, pngBytes: Buffer): void {
  if (!pngBytes || pngBytes.length === 0) throw new Error("Empty icon image");
  if (pngBytes.length > 256 * 1024) throw new Error("Icon image is too large");
  if (!fs.existsSync(prismDir)) fs.mkdirSync(prismDir, { recursive: true });
  fs.writeFileSync(path.join(prismDir, ICON_IMAGE_FILENAME), pngBytes);
  const settings = readProjectSettings(prismDir);
  settings.projectIcon = { kind: "image", value: ICON_IMAGE_FILENAME };
  writeProjectSettings(prismDir, settings);
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
  prismDir: string,
): { rel: string; abs: string } | { error: "not_configured" } {
  const dirs = readWorkspaceDirs(prismDir);
  const exp = findExperimentConfig(dirs);
  if (!exp) return { error: "not_configured" };
  const root = projectRoot.replace(/\\/g, "/");
  return { rel: exp.dir, abs: path.join(root, exp.dir) };
}
