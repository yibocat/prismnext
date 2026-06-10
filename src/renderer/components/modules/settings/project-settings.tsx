import { useSettingsStore } from "@/stores/settings-store";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ProjectSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Projects</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Defaults for new projects. Existing projects are not affected.
          </p>
        </div>

        <div className="rounded-md border border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="space-y-0.5">
              <Label className="text-[length:var(--font-size-13)]">Manuscript directory</Label>
              <p className="text-[length:var(--font-hint)] text-muted-foreground">
                Default name for the LaTeX source directory in new projects.
              </p>
            </div>
            <Input
              value={settings.manuscriptDir ?? "manuscript"}
              onChange={(e) => updateSettings({ manuscriptDir: e.target.value || "manuscript" })}
              className="w-40 h-7 text-[length:var(--font-size-12)]"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="space-y-0.5">
              <Label className="text-[length:var(--font-size-13)]">Default document class</Label>
              <p className="text-[length:var(--font-hint)] text-muted-foreground">
                Document class used in the auto-generated main.tex template.
              </p>
            </div>
            <Select
              value={settings.defaultDocClass ?? "article"}
              onValueChange={(v) => updateSettings({ defaultDocClass: v as "article" | "report" | "book" })}
            >
              <SelectTrigger className="w-28 h-7 text-[length:var(--font-size-12)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article">Article</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="book">Book</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div className="space-y-0.5">
              <Label className="text-[length:var(--font-size-13)]">Auto-create main.tex</Label>
              <p className="text-[length:var(--font-hint)] text-muted-foreground">
                Generate a main.tex template when creating a new project.
              </p>
            </div>
            <Switch
              checked={settings.autoCreateMainTex ?? true}
              onCheckedChange={(v) => updateSettings({ autoCreateMainTex: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
