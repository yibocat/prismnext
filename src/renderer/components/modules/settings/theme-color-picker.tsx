import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AppSettings } from "@/stores/settings-store";

interface ThemeDef {
  id: NonNullable<AppSettings["themeColor"]>;
  label: string;
  primary: string;
  palette: string[];
}

const THEMES: ThemeDef[] = [
  {
    id: "academic-blue",
    label: "Academic Blue",
    primary: "oklch(0.50 0.14 260)",
    palette: [
      "oklch(0.90 0.02 250)",
      "oklch(0.68 0.06 255)",
      "oklch(0.50 0.14 260)",
      "oklch(0.35 0.10 255)",
      "oklch(0.20 0.06 250)",
    ],
  },
  {
    id: "teal",
    label: "Teal",
    primary: "oklch(0.48 0.14 185)",
    palette: [
      "oklch(0.90 0.03 195)",
      "oklch(0.68 0.08 190)",
      "oklch(0.48 0.14 185)",
      "oklch(0.33 0.10 188)",
      "oklch(0.18 0.06 185)",
    ],
  },
  {
    id: "ink-green",
    label: "Ink Green",
    primary: "oklch(0.48 0.14 170)",
    palette: [
      "oklch(0.90 0.03 140)",
      "oklch(0.68 0.08 155)",
      "oklch(0.48 0.14 170)",
      "oklch(0.33 0.10 150)",
      "oklch(0.18 0.06 135)",
    ],
  },
  {
    id: "rose",
    label: "Rose",
    primary: "oklch(0.50 0.16 20)",
    palette: [
      "oklch(0.90 0.03 25)",
      "oklch(0.68 0.08 22)",
      "oklch(0.50 0.16 20)",
      "oklch(0.35 0.12 18)",
      "oklch(0.20 0.06 15)",
    ],
  },
  {
    id: "violet",
    label: "Violet",
    primary: "oklch(0.50 0.16 280)",
    palette: [
      "oklch(0.90 0.03 280)",
      "oklch(0.68 0.08 278)",
      "oklch(0.50 0.16 280)",
      "oklch(0.35 0.12 275)",
      "oklch(0.20 0.06 280)",
    ],
  },
  {
    id: "amber",
    label: "Amber",
    primary: "oklch(0.52 0.20 90)",
    palette: [
      "oklch(0.92 0.06 90)",
      "oklch(0.72 0.12 90)",
      "oklch(0.52 0.20 90)",
      "oklch(0.38 0.14 85)",
      "oklch(0.22 0.08 90)",
    ],
  },
  {
    id: "mono",
    label: "Mono",
    primary: "oklch(0.48 0 0)",
    palette: [
      "oklch(0.90 0 0)",
      "oklch(0.68 0 0)",
      "oklch(0.48 0 0)",
      "oklch(0.30 0 0)",
      "oklch(0.15 0 0)",
    ],
  },
];

function PaletteBar({ palette }: { palette: string[] }) {
  return (
    <div className="flex h-5 rounded-full overflow-hidden border border-white/10 shrink-0 w-24">
      {palette.map((c, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

interface ThemeColorPickerProps {
  value: NonNullable<AppSettings["themeColor"]>;
  onChange: (v: NonNullable<AppSettings["themeColor"]>) => void;
}

export function ThemeColorPicker({ value, onChange }: ThemeColorPickerProps) {
  const [open, setOpen] = useState(false);
  const current = THEMES.find((t) => t.id === value) ?? THEMES[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 hover:bg-muted/50 transition-colors"
        >
          <div
            className="size-4 rounded-full border border-white/10 shrink-0"
            style={{ backgroundColor: current.primary }}
          />
          <span className="text-[length:var(--font-size-13)]">{current.label}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end" sideOffset={4}>
        <div className="space-y-1">
          {THEMES.map((t) => {
            const selected = t.id === value;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                  "hover:bg-muted",
                  selected && "bg-muted ring-1 ring-inset ring-border",
                )}
              >
                <PaletteBar palette={t.palette} />
                <span className="flex-1 text-left text-[length:var(--font-size-13)] font-medium">
                  {t.label}
                </span>
                {selected && <CheckIcon className="size-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
