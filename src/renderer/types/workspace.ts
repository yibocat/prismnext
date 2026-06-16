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

export const FOLDER_FUNCTION_ICONS: Record<FolderFunction, string> = {
  manuscript: "📝",
  experiment: "🧪",
  literature: "📚",
  notebook: "📓",
  custom: "⚙️",
};

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
  mainTex: string;
}

export interface ExperimentFolder {
  function: "experiment";
  name: string;
  description?: string;
}

export interface LiteratureFolder {
  function: "literature";
  name: string;
  description?: string;
}

export interface NotebookFolder {
  function: "notebook";
  name: string;
  description?: string;
}

export interface CustomFolder {
  function: "custom";
  name: string;
  description?: string;
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

/** Default workspaceDirs for a new project */
export function defaultWorkspaceDirs(): WorkspaceFolder[] {
  return [{ function: "manuscript", name: DEFAULT_MANUSCRIPT_DIR, mainTex: "main.tex" }];
}
