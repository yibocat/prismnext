import { Kbd } from "@/components/ui/kbd";
import { resolveShortcut } from "./resolve";
import { chordDisplayParts, detectShortcutPlatform } from "../../../shared/shortcuts";
import { cn } from "@/lib/utils";

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

  const platform = detectShortcutPlatform(window.electronAPI?.platform ?? "darwin");
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
