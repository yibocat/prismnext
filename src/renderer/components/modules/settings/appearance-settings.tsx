import { useTheme } from "next-themes";
import { useSettingsStore } from "@/stores/settings-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Appearance</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Customize the look and feel.
          </p>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Theme</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Color scheme for the editor and interface.
            </p>
          </div>
          <Select
            value={theme}
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
