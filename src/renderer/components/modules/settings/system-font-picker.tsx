// components/modules/settings/system-font-picker.tsx
// Searchable system-font picker for Appearance typography.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { appMenuFontClass, appMenuItemClass } from "@/components/ui/app-menu";
import { appSelectTriggerClass } from "@/components/ui/app-select";
import {
  getCachedSystemFonts,
  getFontById,
  listSystemFonts,
  migrateFontValue,
  resolveFontCssFamily,
  type SystemFontEntry,
} from "@/lib/theme/font-options";

export type { SystemFontEntry };

type Preset = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Prefer monospace faces first (editor / code). */
  preferMono?: boolean;
  className?: string;
  /** Trigger width class. */
  triggerClassName?: string;
};

function displayLabel(value: string, presets: Preset[]): string {
  const migrated = migrateFontValue(value, presets[0]?.value === "system-mono" ? "mono" : "sans");
  const preset = presets.find((p) => p.value === migrated);
  if (preset) return preset.label;
  const known = getFontById(migrated);
  if (known) return known.label;
  return migrated;
}

export function SystemFontPicker({
  value,
  onChange,
  preferMono = false,
  className,
  triggerClassName,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cachedFonts = getCachedSystemFonts();
  const [fonts, setFonts] = useState<SystemFontEntry[]>(cachedFonts ?? []);
  const [loading, setLoading] = useState(!cachedFonts);
  const [error, setError] = useState<string | null>(null);

  const presets: Preset[] = useMemo(
    () =>
      preferMono
        ? [{ value: "system-mono", label: t("settings.appearance.systemFontPreset") }]
        : [{ value: "system-ui", label: t("settings.appearance.systemFontPreset") }],
    [preferMono, t],
  );

  useEffect(() => {
    const cached = getCachedSystemFonts();
    if (cached) {
      setFonts(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listSystemFonts()
      .then((list) => {
        if (cancelled) return;
        setFonts(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedFonts = useMemo(() => {
    if (!preferMono) return fonts;
    const mono = fonts.filter((f) => f.monospace);
    const rest = fonts.filter((f) => !f.monospace);
    return [...mono, ...rest];
  }, [fonts, preferMono]);

  const label = displayLabel(value, presets);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="xs"
          className={cn(
            appSelectTriggerClass,
            "justify-between gap-1.5 shadow-xs",
            triggerClassName ?? "w-44",
            className,
          )}
        >
          <span
            className="min-w-0 truncate"
            style={{
              fontFamily: resolveFontCssFamily(
                value,
                preferMono ? "mono" : "sans",
              ),
            }}
          >
            {label}
          </span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-56 p-0", appMenuFontClass)}
        align="end"
        sideOffset={4}
      >
        <Command
          className={cn(
            "rounded-md",
            "[&_[cmdk-input-wrapper]]:h-8 [&_[cmdk-input-wrapper]]:gap-1.5 [&_[cmdk-input-wrapper]]:px-2",
            "[&_[cmdk-input-wrapper]_svg]:!size-3.5",
          )}
        >
          <CommandInput
            placeholder={t("settings.appearance.systemFontSearch")}
            className="!h-7 !min-h-0 !py-0 text-[length:var(--font-menu-item)]"
          />
          <CommandList className="max-h-56">
            <CommandEmpty className="py-3 text-center text-[length:var(--font-menu-item)] text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2Icon className="size-3 animate-spin" />
                  {t("settings.appearance.systemFontLoading")}
                </span>
              ) : error ? (
                t("settings.appearance.systemFontError")
              ) : (
                t("settings.appearance.systemFontEmpty")
              )}
            </CommandEmpty>
            <CommandGroup
              heading={t("settings.appearance.systemFontPresets")}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              {presets.map((p) => (
                <CommandItem
                  key={p.value}
                  value={`${p.label} ${p.value}`}
                  className={cn(appMenuItemClass, "cursor-pointer gap-1.5 py-1")}
                  onSelect={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "size-3 shrink-0",
                      value === p.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {orderedFonts.length > 0 ? (
              <CommandGroup
                heading={t("settings.appearance.systemFontInstalled")}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
              >
                {orderedFonts.map((f) => (
                  <CommandItem
                    key={f.family}
                    value={f.family}
                    className={cn(appMenuItemClass, "cursor-pointer gap-1.5 py-1")}
                    onSelect={() => {
                      onChange(f.family);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "size-3 shrink-0",
                        value === f.family ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate" style={{ fontFamily: `"${f.family}"` }}>
                      {f.family}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
