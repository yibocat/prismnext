import { cn } from "@/lib/utils";

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

/** Keep a short glyph (emoji / symbol); reject empty or oversized junk. */
export function normalizeProjectIcon(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.length > 16) return null;
  return value;
}

/** Read `projectIcon` from a project's `.prismnext/settings.json`. */
export async function loadProjectIcon(projectPath: string): Promise<string | null> {
  const root = projectPath.replace(/[/\\]+$/, "");
  try {
    const settingsRes = await window.electronAPI.fsRead(
      `${root}/.prismnext/settings.json`,
    );
    const raw = settingsRes?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { projectIcon?: unknown };
    if (typeof parsed.projectIcon !== "string") return null;
    return normalizeProjectIcon(parsed.projectIcon);
  } catch {
    return null;
  }
}

export function ProjectIconBadge({
  icon,
  name,
  muted,
  className,
}: {
  icon?: string | null;
  name: string;
  muted?: boolean;
  className?: string;
}) {
  const normalized = normalizeProjectIcon(icon);
  if (normalized) {
    return (
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[length:var(--font-size-14)] leading-none",
          muted && "opacity-45",
          className,
        )}
        aria-hidden
      >
        {normalized}
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
