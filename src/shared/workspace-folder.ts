export type FolderFunction =
  | "manuscript"
  | "experiment"
  | "literature"
  | "notebook"
  | "custom";

export const FOLDER_FUNCTIONS: FolderFunction[] = [
  "manuscript",
  "experiment",
  "literature",
  "notebook",
  "custom",
];

export const FOLDER_FUNCTION_LABELS: Record<FolderFunction, string> = {
  manuscript: "Manuscript",
  experiment: "Experiment",
  literature: "Literature",
  notebook: "Notebook",
  custom: "Custom",
};

export {
  FOLDER_FUNCTION_LUCIDE_ICON_NAMES as FOLDER_FUNCTION_LUCIDE_ICONS,
  FOLDER_FUNCTION_ICONS,
} from "./workspace-folder-icons";

/** Top-level configured workspace folder by directory name. */
export function findWorkspaceFolder(
  folderPath: string,
  dirs: WorkspaceFolder[],
): WorkspaceFolder | null {
  if (folderPath.includes("/")) return null;
  return dirs.find((d) => d.name === folderPath) ?? null;
}

export const DEFAULT_FUNCTION_DESCRIPTIONS: Record<FolderFunction, string | null> = {
  manuscript:
    "Contains LaTeX manuscript files for writing academic papers. " +
    "The main entry point is `main.tex`. " +
    "This folder is bound to the TeX workspace (editor + PDF preview).",
  experiment:
    "Contains experiment-related files such as data, scripts, results, and analysis.",
  literature:
    "Stores literature and reference PDFs for academic research and citation.",
  notebook:
    "Contains notes in various formats such as Markdown files or Jupyter notebooks.",
  custom: null,
};

export interface ManuscriptFolder {
  function: "manuscript";
  name: string;
  description?: string;
  /** Lucide icon name (PascalCase), e.g. `BookOpen`. Shown in Files tree. */
  icon?: string;
  mainTex: string;
}

export interface ExperimentFolder {
  function: "experiment";
  name: string;
  description?: string;
  icon?: string;
}

export interface LiteratureFolder {
  function: "literature";
  name: string;
  description?: string;
  icon?: string;
}

export interface NotebookFolder {
  function: "notebook";
  name: string;
  description?: string;
  icon?: string;
}

export interface CustomFolder {
  function: "custom";
  name: string;
  description?: string;
  icon?: string;
  customLabel?: string;
}

export type WorkspaceFolder =
  | ManuscriptFolder
  | ExperimentFolder
  | LiteratureFolder
  | NotebookFolder
  | CustomFolder;

/** Extracted from workspaceDirs — the single manuscript config, or null if none configured */
export interface ManuscriptConfig {
  dir: string;
  mainTex: string;
}

/** Find the first manuscript entry in workspaceDirs */
export function findManuscriptConfig(
  dirs: WorkspaceFolder[],
): ManuscriptConfig | null {
  const m = dirs.find(
    (d): d is ManuscriptFolder => d.function === "manuscript",
  );
  if (!m) return null;
  return { dir: m.name, mainTex: m.mainTex };
}

/** Create a default workspace folder entry */
export function createDefaultFolder(
  name: string,
  func: FolderFunction,
): WorkspaceFolder {
  const base = { name, function: func as WorkspaceFolder["function"] };
  switch (func) {
    case "manuscript":
      return { ...base, mainTex: "main.tex" } as ManuscriptFolder;
    case "custom":
      return { ...base } as CustomFolder;
    default:
      return base as WorkspaceFolder;
  }
}

/** Default manuscript directory name — used as fallback when no manuscript is configured */
export const DEFAULT_MANUSCRIPT_DIR = "manuscript";

/** Default reading-notes directory name */
export const DEFAULT_NOTEBOOK_DIR = "notes";

export interface NotebookConfig {
  dir: string;
}

/** Find the first notebook entry in workspaceDirs */
export function findNotebookConfig(dirs: WorkspaceFolder[]): NotebookConfig | null {
  const n = dirs.find((d): d is NotebookFolder => d.function === "notebook");
  if (!n) return null;
  return { dir: n.name };
}

/** Notebook directory for reading notes — configured name or default. */
export function resolveNotebookDir(dirs: WorkspaceFolder[]): string {
  return findNotebookConfig(dirs)?.dir ?? DEFAULT_NOTEBOOK_DIR;
}

/** Extracted from workspaceDirs — the single experiment config, or null if none configured. */
export interface ExperimentConfig {
  dir: string;
}

/**
 * Find the first experiment entry in workspaceDirs.
 *
 * Experiment is opt-in: `defaultWorkspaceDirs()` does NOT include it, so
 * absence is the expected state for most projects and must propagate as null
 * (do not fall back to a default name). Callers surface "not configured" to
 * the agent rather than auto-creating a folder.
 */
export function findExperimentConfig(dirs: WorkspaceFolder[]): ExperimentConfig | null {
  const e = dirs.find((d): d is ExperimentFolder => d.function === "experiment");
  if (!e) return null;
  return { dir: e.name };
}

/** Top-level folder name → workspace function, if configured. */
export function folderWorkspaceFunction(
  folderPath: string,
  dirs: WorkspaceFolder[],
): FolderFunction | null {
  if (folderPath.includes("/")) return null;
  const match = dirs.find((d) => d.name === folderPath);
  return match?.function ?? null;
}

/** Default workspaceDirs for a new project */
export function defaultWorkspaceDirs(): WorkspaceFolder[] {
  return [
    { function: "manuscript", name: DEFAULT_MANUSCRIPT_DIR, mainTex: "main.tex" },
    { function: "notebook", name: DEFAULT_NOTEBOOK_DIR },
  ];
}
