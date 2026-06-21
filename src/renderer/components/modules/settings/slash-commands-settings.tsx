import CommandsSettings from "./commands-settings";

export function SlashCommandsSettings() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Commands</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Built-in and per-project slash commands for the chat composer.
          </p>
        </div>

        <CommandsSettings />
      </div>
    </div>
  );
}
