export function GeneralSettings() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">General</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Basic application settings.
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-[length:var(--font-button)] text-muted-foreground">
            General settings will be available in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
