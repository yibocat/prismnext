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
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          Terminal and agent bash settings live under Agent and Terminal in the sidebar.
        </p>
      </div>
    </div>
  );
}
