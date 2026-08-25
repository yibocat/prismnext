import { Kbd } from "@/components/ui/kbd";
import { desktopPlatform } from "@/lib/desktop-api/shell";
import { resolveShortcut } from "./resolve";
import { chordDisplayParts, detectShortcutPlatform } from "../../../shared/shortcuts";
import { cn } from "@/lib/utils";

/** Parent must be `group`. Hidden until the row is hovered, focused, or menu-highlighted. */
export const SHORTCUT_CHIPS_HOVER_REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[highlighted]:opacity-100";

/** Separate Kbd chips for a registry shortcut (same look as Hint tooltips). */
export function ShortcutKbdChips({
  id,
  className,
  kbdClassName,
}: {
  id: string;
  className?: string;
  kbdClassName?: string;
}) {
  const resolved = resolveShortcut(id);
  if (!resolved?.chord) return null;

  const platform = detectShortcutPlatform(desktopPlatform());
  const keys = chordDisplayParts(resolved.chord, platform);
  if (keys.length === 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        <Kbd
          key={`${id}-${i}`}
          className={cn("h-4 min-w-4 px-1 text-[length:var(--font-size-10)]", kbdClassName)}
        >
          {k}
        </Kbd>
      ))}
    </span>
  );
}
