import { icons, type LucideIcon, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidLucideIconName } from "@/lib/workspace/folder-icons";
import { sessionIconColorClass } from "@/lib/chat/session-icon-registry";
import type { IconSpec } from "@shared/platform/icon-spec";

export type IconFallback = "package" | "letter";
export type IconVariant = "badge" | "bare";

export interface IconRendererProps {
  spec: IconSpec | null | undefined;
  size?: "sm" | "md" | "lg";
  /** Name used for the `letter` fallback avatar. */
  name?: string;
  fallback?: IconFallback;
  /** Overrides the default `Package` fallback icon (badge + bare). */
  fallbackIcon?: LucideIcon;
  /** `badge` = boxed chip (settings/lists); `bare` = inline glyph for toolbars. */
  variant?: IconVariant;
  /**
   * Resolved data URL for `kind: "image"`. Callers load via `useIconImageSrc`
   * (file under team dir / `.workbench/`).
   */
  imageSrc?: string | null;
  className?: string;
}

const SIZE_BOX = { sm: "size-7", md: "size-8", lg: "size-10" } as const;
const SIZE_GLYPH = {
  sm: "text-[length:var(--font-size-14)]",
  md: "text-[length:var(--font-size-16)]",
  lg: "text-[length:var(--font-size-20)]",
} as const;
const SIZE_ICON = { sm: "size-3.5", md: "size-4", lg: "size-4.5" } as const;
const SIZE_LETTER = {
  sm: "text-[length:var(--font-size-12)]",
  md: "text-[length:var(--font-size-13)]",
  lg: "text-[length:var(--font-size-15)]",
} as const;

const AVATAR_TONES = [
  "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  "bg-violet-500/20 text-violet-600 dark:text-violet-400",
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  "bg-rose-500/20 text-rose-600 dark:text-rose-400",
  "bg-teal-500/20 text-teal-600 dark:text-teal-400",
] as const;

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** Render an IconSpec (emoji / lucide / image) with a graceful fallback. */
export function IconRenderer({
  spec,
  size = "md",
  name,
  fallback = "package",
  fallbackIcon,
  variant = "badge",
  imageSrc,
  className,
}: IconRendererProps) {
  const FallbackIcon = fallbackIcon ?? Package;
  const resolvedImage =
    imageSrc
    ?? (spec?.kind === "image" && spec.value.startsWith("data:") ? spec.value : null);

  // Bare variant: inline glyph / icon for toolbar triggers (no chip box).
  if (variant === "bare") {
    if (spec?.kind === "emoji" && spec.value) {
      // Emoji is a font glyph (Apple Color Emoji sits low in the em-box).
      // Put it in the same SIZE_ICON flex box as Lucide so items-center rows line up.
      return (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center leading-none",
            SIZE_ICON[size],
            className,
          )}
          aria-hidden
        >
          <span className={cn("leading-none", SIZE_GLYPH[size])}>{spec.value}</span>
        </span>
      );
    }
    if (spec?.kind === "lucide" && isValidLucideIconName(spec.value)) {
      const Icon = icons[spec.value] as LucideIcon;
      return (
        <Icon
          className={cn(
            "shrink-0",
            SIZE_ICON[size],
            spec.color ? sessionIconColorClass(spec.color) : undefined,
            className,
          )}
          aria-hidden
        />
      );
    }
    if (spec?.kind === "image" && resolvedImage) {
      return (
        <img
          src={resolvedImage}
          alt=""
          className={cn("shrink-0 rounded-sm object-cover", SIZE_ICON[size], className)}
        />
      );
    }
    if (fallback === "letter" && name) {
      const letter = (name.trim().charAt(0) || "?").toUpperCase();
      return (
        <span className={cn("font-semibold", SIZE_LETTER[size], className)} aria-hidden>
          {letter}
        </span>
      );
    }
    return <FallbackIcon className={cn("shrink-0", SIZE_ICON[size], className)} aria-hidden />;
  }

  // Badge variant: boxed chip (settings / lists / detail header).
  const base = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
    SIZE_BOX[size],
    className,
  );

  if (spec?.kind === "emoji" && spec.value) {
    return (
      <span className={cn(base, "border-transparent")} aria-hidden>
        <span className={cn("leading-none", SIZE_GLYPH[size])}>{spec.value}</span>
      </span>
    );
  }
  if (spec?.kind === "lucide" && isValidLucideIconName(spec.value)) {
    const Icon = icons[spec.value] as LucideIcon;
    return (
      <span className={base} aria-hidden>
        <Icon
          className={cn(
            spec.color ? sessionIconColorClass(spec.color) : "text-muted-foreground",
            SIZE_ICON[size],
          )}
        />
      </span>
    );
  }
  if (spec?.kind === "image" && resolvedImage) {
    return (
      <span className={base} aria-hidden>
        <img src={resolvedImage} alt="" className="size-full object-cover" />
      </span>
    );
  }
  if (fallback === "letter" && name) {
    const letter = (name.trim().charAt(0) || "?").toUpperCase();
    return (
      <span
        className={cn(base, "border-transparent font-semibold", avatarTone(name))}
        aria-hidden
      >
        <span className={SIZE_LETTER[size]}>{letter}</span>
      </span>
    );
  }
  return (
    <span className={base} aria-hidden>
      <FallbackIcon className={cn("text-muted-foreground", SIZE_ICON[size])} />
    </span>
  );
}
