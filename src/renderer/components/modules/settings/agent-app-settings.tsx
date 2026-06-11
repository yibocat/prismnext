import { useState, useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function AgentAppSettings() {
  const agentSystemPrompt = useSettingsStore((s) => s.settings.agentSystemPrompt) ?? "";
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [local, setLocal] = useState(agentSystemPrompt);
  const [defaultPrompt, setDefaultPrompt] = useState("");

  useEffect(() => {
    window.electronAPI.settingsGetDefaultAgentPrompt().then(setDefaultPrompt).catch(() => {});
  }, []);

  const effectivePrompt = local.trim() || defaultPrompt;
  const isCustom = local.trim().length > 0;

  const handleSave = () => {
    updateSettings({ agentSystemPrompt: local });
  };

  const handleReset = () => {
    setLocal("");
    updateSettings({ agentSystemPrompt: "" });
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-medium mb-1">System Prompt</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Customize the AI's base instructions. Leave blank to use the built-in Prism editor persona.
        </p>
        <textarea
          className="w-full h-40 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono resize-y"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Leave blank to use the built-in default…"
        />
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {isCustom ? "Using custom prompt" : "Using built-in default"}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          onClick={handleSave}
        >
          Save
        </button>
        <button
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-30"
          onClick={handleReset}
          disabled={!isCustom}
        >
          Reset to default
        </button>
      </div>

      {/* Effective prompt preview */}
      <div>
        <h3 className="text-sm font-medium mb-1">
          Effective Prompt Preview
          {isCustom && (
            <span className="ml-1 text-[10px] font-normal text-primary">(custom)</span>
          )}
        </h3>
        <pre className="w-full max-h-64 overflow-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {effectivePrompt || "Loading…"}
        </pre>
      </div>
    </div>
  );
}
