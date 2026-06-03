import { useTheme } from "next-themes";
import { useSettingsStore, type AppSettings } from "@/stores/settings-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ThemeColorPicker } from "./theme-color-picker";

const INTENSITY_LABELS: Record<number, string> = {
  1: "Minimal",
  2: "Subtle",
  3: "Medium",
  4: "Strong",
  5: "Strongest",
};

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const glassEffect = settings.glassEffect ?? true;
  const glassIntensity = settings.glassIntensity ?? 3;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Appearance</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Customize the look and feel.
          </p>
        </div>

        {/* Theme — locked to System when glass is on to match native vibrancy tint */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Theme</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {glassEffect
                ? "Locked to System while Desktop glass is active."
                : "Color scheme for the editor and interface."}
            </p>
          </div>
          <Select
            value={glassEffect ? "system" : theme}
            disabled={glassEffect}
            onValueChange={(v) => {
              setTheme(v);
              updateSettings({ theme: v as "dark" | "light" | "system" });
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Theme Color */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Theme color</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Accent color for buttons, links, and interactive elements.
            </p>
          </div>
          <ThemeColorPicker
            value={settings.themeColor ?? "academic-blue"}
            onChange={(v) => updateSettings({ themeColor: v })}
          />
        </div>

        {/* Desktop glass */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[length:var(--font-button)] font-medium">Desktop glass</p>
              <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
                Show the desktop through a frosted-glass blur effect.
              </p>
            </div>
            <Switch
              checked={glassEffect}
              onCheckedChange={(v) => updateSettings({ glassEffect: v })}
            />
          </div>

          <div
            className={cn(
              "space-y-2 pl-0.5 transition-opacity duration-200",
              !glassEffect && "opacity-40 pointer-events-none",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[length:var(--font-dialog-label)] text-muted-foreground">
                Intensity
              </span>
              <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground tabular-nums">
                {INTENSITY_LABELS[glassIntensity]}
              </span>
            </div>
            <Slider
              value={[glassIntensity]}
              min={1}
              max={5}
              step={1}
              onValueChange={([v]: number[]) => {
                if (v !== undefined) updateSettings({ glassIntensity: v });
              }}
              disabled={!glassEffect}
            />
            <div className="flex justify-between text-[length:var(--font-size-10)] text-muted-foreground/50">
              <span>More solid</span>
              <span>More glass</span>
            </div>
          </div>
        </div>

        {/* Font size — placeholder */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Font size</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Application zoom level.
            </p>
          </div>
          <span className="text-[length:var(--font-dialog-label)] text-muted-foreground/50">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
