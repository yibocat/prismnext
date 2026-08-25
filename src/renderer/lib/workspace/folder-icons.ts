import { icons } from "lucide-react";
import type { FolderFunction, WorkspaceFolder } from "@/types/workspace";
import { FOLDER_FUNCTION_LUCIDE_ICON_NAMES } from "../../../shared/workbench/workspace-folder-icons";

export type LucideIconName = keyof typeof icons;

export const FOLDER_FUNCTION_LUCIDE_ICONS: Record<FolderFunction, LucideIconName> =
  FOLDER_FUNCTION_LUCIDE_ICON_NAMES;

/** @deprecated Use FOLDER_FUNCTION_LUCIDE_ICONS */
export const FOLDER_FUNCTION_ICONS = FOLDER_FUNCTION_LUCIDE_ICONS;

/**
 * Flat picker set for session / team IconPicker.
 * Unknown names are dropped so a Lucide rename does not break typecheck.
 */
const PICKER_LUCIDE_CANDIDATES: string[] = [
  "FileText", "File", "Files", "FileCode", "FileSpreadsheet", "FileImage",
  "FilePlus", "FileMinus", "FileCheck", "FileSearch", "FilePen", "FileBox",
  "PenLine", "Pencil", "Highlighter", "Eraser", "Type",
  "BookOpen", "Book", "BookMarked", "BookCopy", "Library", "LibraryBig",
  "NotebookPen", "Notebook", "NotebookTabs", "ScrollText", "GraduationCap",
  "Newspaper", "Quote", "Bookmark", "BookmarkPlus", "BookmarkCheck",
  "FlaskConical", "FlaskRound", "Microscope", "Atom", "Brain", "Dna",
  "TestTube", "TestTubes", "Telescope", "Orbit", "Pill", "Stethoscope",
  "Activity", "HeartPulse", "Syringe", "Radiation", "Biohazard", "Leaf",
  "Database", "ChartBar", "ChartColumn", "ChartLine", "ChartPie", "ChartArea",
  "Table2", "Table", "Columns3", "Rows3", "Sigma",
  "Code", "CodeXml", "Terminal", "SquareTerminal", "Braces", "Brackets",
  "Binary", "Cpu", "Bug", "Variable", "SquareFunction", "Regex",
  "Folder", "FolderOpen", "FolderCog", "FolderGit2", "FolderPlus", "FolderTree",
  "Archive", "Package", "PackageOpen", "Inbox", "HardDrive", "Save",
  "Download", "Upload", "Paperclip", "Link", "Link2", "Unlink",
  "Star", "Tag", "Tags", "Lightbulb", "Wrench", "Settings", "Settings2",
  "Layers", "LayoutGrid", "LayoutList", "LayoutDashboard", "PanelsTopLeft",
  "Search", "ListFilter", "ListTodo", "ListChecks", "List", "ListOrdered",
  "Calendar", "CalendarDays", "Clock", "Timer", "Hourglass", "History",
  "Flag", "FlagTriangleRight", "MessageSquare", "MessagesSquare", "MessageCircle",
  "Mail", "Send", "Bell", "Inbox",
  "Users", "User", "UserRound", "Bot", "Handshake",
  "Globe", "Earth", "Share2", "Map", "MapPin", "Compass",
  "House", "Building2", "Building", "University", "School",
  "Rocket", "Target", "Crosshair", "Zap", "Sparkles", "Flame",
  "Sun", "Moon", "Cloud", "CloudRain", "Snowflake", "Rainbow",
  "Camera", "Image", "Images", "Video", "Film", "Music", "Mic", "Headphones",
  "Keyboard", "MousePointer", "Monitor", "Laptop", "Smartphone", "Tablet",
  "Lock", "LockOpen", "Key", "KeyRound", "Shield", "ShieldCheck", "ShieldAlert",
  "Eye", "EyeOff", "ScanFace",
  "GitBranch", "GitMerge", "GitPullRequest", "GitCommitHorizontal", "Workflow",
  "Network", "Server", "Wifi", "Bluetooth", "Antenna",
  "Calculator", "Presentation", "Projector", "ClipboardList", "ClipboardCheck",
  "Clipboard", "StickyNote", "Pin", "Award", "Trophy", "Medal", "Crown",
  "CircleQuestionMark", "Info", "TriangleAlert", "CircleAlert", "CircleCheck",
  "Play", "Pause", "Square", "Circle", "Hexagon", "Diamond",
  "ArrowUpRight", "TrendingUp", "TrendingDown", "Gauge", "Scale",
  "Coffee", "Apple", "Utensils", "Plane", "Car", "Bike",
];

export const PICKER_LUCIDE_ICONS: LucideIconName[] = [
  ...new Set(PICKER_LUCIDE_CANDIDATES.filter((name): name is LucideIconName => name in icons)),
];

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
