import { BackupsSettingsPanel } from "./backups-settings-panel";

export function BackupsSettings() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Backups</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Moved to TeX Workspace settings.
          </p>
        </div>
        <BackupsSettingsPanel />
      </div>
    </div>
  );
}
