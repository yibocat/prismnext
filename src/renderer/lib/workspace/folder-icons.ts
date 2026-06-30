import { icons } from "lucide-react";
import type { FolderFunction, WorkspaceFolder } from "@/types/workspace";
import { FOLDER_FUNCTION_LUCIDE_ICON_NAMES } from "../../../shared/workspace-folder-icons";

export type LucideIconName = keyof typeof icons;

export const FOLDER_FUNCTION_LUCIDE_ICONS: Record<FolderFunction, LucideIconName> =
  FOLDER_FUNCTION_LUCIDE_ICON_NAMES;

/** @deprecated Use FOLDER_FUNCTION_LUCIDE_ICONS */
export const FOLDER_FUNCTION_ICONS = FOLDER_FUNCTION_LUCIDE_ICONS;

export const FOLDER_ICON_CATEGORIES: Array<{ label: string; icons: LucideIconName[] }> = [
  {
    label: "Writing & research",
    icons: [
      "FileText",
      "PenLine",
      "BookOpen",
      "Library",
      "NotebookPen",
      "ScrollText",
      "GraduationCap",
      "Newspaper",
    ],
  },
  {
    label: "Science & lab",
    icons: [
      "FlaskConical",
      "Microscope",
      "Atom",
      "Brain",
      "Dna",
      "TestTube",
      "Telescope",
      "Orbit",
    ],
  },
  {
    label: "Data & code",
    icons: [
      "Database",
      "ChartBar",
      "ChartLine",
      "Table2",
      "Code",
      "Terminal",
      "Cpu",
      "Binary",
    ],
  },
  {
    label: "Files & folders",
    icons: [
      "Folder",
      "FolderOpen",
      "FolderCog",
      "Archive",
      "Package",
      "Files",
      "Inbox",
      "HardDrive",
    ],
  },
  {
    label: "General",
    icons: [
      "Star",
      "Bookmark",
      "Tag",
      "Lightbulb",
      "Wrench",
      "Settings",
      "Layers",
      "LayoutGrid",
    ],
  },
];

export function isValidLucideIconName(name: string): name is LucideIconName {
  return name in icons;
}

/** Ignore legacy emoji / invalid stored values. */
export function normalizeStoredFolderIcon(name: string | undefined | null): LucideIconName | null {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  return isValidLucideIconName(trimmed) ? trimmed : null;
}

export function defaultFolderIcon(func: FolderFunction): LucideIconName {
  return FOLDER_FUNCTION_LUCIDE_ICONS[func];
}

export function resolveFolderIconName(folder: WorkspaceFolder): LucideIconName {
  return normalizeStoredFolderIcon(folder.icon) ?? FOLDER_FUNCTION_LUCIDE_ICONS[folder.function];
}

/** @deprecated Use resolveFolderIconName */
export function resolveFolderIcon(folder: WorkspaceFolder): LucideIconName {
  return resolveFolderIconName(folder);
}
