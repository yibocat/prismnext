/** Default Lucide icon names per workspace folder type — safe for main + renderer (no lucide import). */
export const FOLDER_FUNCTION_LUCIDE_ICON_NAMES = {
  manuscript: "FileText",
  experiment: "FlaskConical",
  literature: "BookOpen",
  notebook: "NotebookPen",
  custom: "FolderCog",
} as const;

/** @deprecated Use FOLDER_FUNCTION_LUCIDE_ICON_NAMES */
export const FOLDER_FUNCTION_ICONS = FOLDER_FUNCTION_LUCIDE_ICON_NAMES;

export type FolderFunctionIconKey = keyof typeof FOLDER_FUNCTION_LUCIDE_ICON_NAMES;
