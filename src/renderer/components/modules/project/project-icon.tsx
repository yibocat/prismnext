import { icons, type LucideIcon } from "lucide-react";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { cn } from "@/lib/utils";
import { isValidLucideIconName } from "@/lib/workspace/folder-icons";
import { normalizeIconSpec, type IconSpec } from "@shared/platform/icon-spec";
import { useIconImageSrc } from "../shared/use-icon-image-src";

export interface ProjectIconCategory {
  label: string;
  icons: string[];
}

/** Categorized emoji for the project-icon picker (Insert Symbol–style panel). */
export const PROJECT_ICON_CATEGORIES: ProjectIconCategory[] = [
  {
    label: "Academic",
    icons: ["📄", "📚", "📝", "📖", "📰", "📑", "🧾", "✏️", "🖊️", "✒️", "📌", "📎"],
  },
  {
    label: "Research",
    icons: ["🧪", "🔬", "🧬", "🔭", "🧠", "💡", "📊", "📈", "🧮", "🛰️", "⚛️", "🧲"],
  },
  {
    label: "Work",
    icons: ["📁", "🗂️", "💼", "🖥️", "💻", "⌨️", "🛠️", "⚙️", "📦", "🚀", "🎯", "✨"],
  },
  {
    label: "Nature",
    icons: ["🌿", "🌱", "🌸", "🌊", "⭐", "🌙", "☀️", "🔥", "❄️", "🌈", "🪐", "🌍"],
  },
];

export const DEFAULT_PROJECT_ICON = PROJECT_ICON_CATEGORIES[0].icons[0];

const PROJECT_AVATAR_TONES = [
  "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  "bg-violet-500/20 text-violet-600 dark:text-violet-400",
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  "bg-rose-500/20 text-rose-600 dark:text-rose-400",
  "bg-teal-500/20 text-teal-600 dark:text-teal-400",
] as const;

function projectAvatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_AVATAR_TONES[Math.abs(hash) % PROJECT_AVATAR_TONES.length];
}

/** @deprecated Use `normalizeIconSpec` for new code; kept for legacy emoji-string callers. */
export function normalizeProjectIcon(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length > 16) return null;
  return value;
}

/** Absolute `.workbench` dir for a project root. */
export function projectIconBaseDir(projectPath: string): string {
  return `${projectPath.replace(/[/\\]+$/, "")}/.workbench`;
}

/** Read `projectIcon` (IconSpec) from a project's `.workbench/settings.json`. */
export async function loadProjectIcon(projectPath: string): Promise<IconSpec | null> {
  const root = projectPath.replace(/[/\\]+$/, "");
  try {
    const settingsRes = await fsDesktop.fsRead(
      `${root}/.workbench/settings.json`,
    );
    const raw = settingsRes?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { projectIcon?: unknown };
    return normalizeIconSpec(parsed.projectIcon);
  } catch {
    return null;
  }
}

/**
 * Project icon badge. Accepts an `IconSpec` (emoji / lucide / image) or a legacy
 * emoji string. Image icons resolve from `<project>/.workbench/icon.png`.
 */
export function ProjectIconBadge({
  icon,
  name,
  muted,
  className,
  projectPath,
  previewSrc,
}: {
  icon?: IconSpec | string | null;
  name: string;
  muted?: boolean;
  className?: string;
  /** Project root — required to resolve image icons from disk. */
  projectPath?: string | null;
  /** Local preview data URL before the file is written. */
  previewSrc?: string | null;
}) {
  const spec = normalizeIconSpec(icon);
  const imageSrc = useIconImageSrc(
    spec,
    projectPath ? projectIconBaseDir(projectPath) : null,
    previewSrc,
  );
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted leading-none";

  if (spec?.kind === "emoji" && spec.value) {
    return (
      <span
        className={cn(
          base,
          "text-[length:var(--font-size-14)]",
          muted && "opacity-45",
          className,
        )}
        aria-hidden
      >
        {spec.value}
      </span>
    );
  }
  if (spec?.kind === "lucide" && isValidLucideIconName(spec.value)) {
    const Icon = icons[spec.value] as LucideIcon;
    return (
      <span
        className={cn(base, "text-muted-foreground", muted && "opacity-45", className)}
        aria-hidden
      >
        <Icon className="size-3.5 shrink-0" />
      </span>
    );
  }
  if (spec?.kind === "image" && imageSrc) {
    return (
      <span
        className={cn(base, "overflow-hidden", muted && "opacity-45", className)}
        aria-hidden
      >
        <img src={imageSrc} alt="" className="size-full object-cover" />
      </span>
    );
  }

  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-[length:var(--font-size-12)] font-semibold",
        muted ? "bg-muted/60 text-muted-foreground" : projectAvatarTone(name),
        className,
      )}
      aria-hidden
    >
      {letter}
    </span>
  );
}
