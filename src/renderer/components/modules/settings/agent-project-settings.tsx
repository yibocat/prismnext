import { useState, useEffect, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";

interface ContextToggles {
  skills: boolean;
  mcp: boolean;
  rules: boolean;
  venv: boolean;
  path: boolean;
}

const DEFAULT_TOGGLES: ContextToggles = {
  skills: true, mcp: true, rules: true, venv: true, path: true,
};

const LABELS: Record<keyof ContextToggles, string> = {
  skills: "Skills",
  mcp: "MCP Config",
  rules: "Rules (CLAUDE.md)",
  venv: "Python venv",
  path: "PATH augmentation",
};

export function AgentProjectSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [toggles, setToggles] = useState<ContextToggles>(DEFAULT_TOGGLES);
  const [claudeMdPreview, setClaudeMdPreview] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      const config = await window.electronAPI.settingsGetAgentProjectConfig(projectRoot);
      setToggles({ ...DEFAULT_TOGGLES, ...config.contextComponents });
    } catch {}
    try {
      const result = await window.electronAPI.fsRead(`${projectRoot}/CLAUDE.md`);
      setClaudeMdPreview(result?.content?.slice(0, 500) || "");
    } catch { setClaudeMdPreview(""); }
    setLoading(false);
  }, [projectRoot]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleToggle = async (key: keyof ContextToggles) => {
    const next = { ...toggles, [key]: !toggles[key] };
    setToggles(next);
    if (projectRoot) {
      try {
        await window.electronAPI.settingsSetAgentProjectConfig(projectRoot, { contextComponents: next });
      } catch {}
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
        Open a project to configure agent settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Project Rules */}
      <div>
        <h3 className="text-sm font-medium mb-1">Project Rules (CLAUDE.md)</h3>
        {claudeMdPreview ? (
          <pre className="w-full h-24 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs overflow-auto whitespace-pre-wrap">
            {claudeMdPreview}{claudeMdPreview.length >= 500 ? "..." : ""}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">No CLAUDE.md found in project root.</p>
        )}
        <button
          className="mt-1 text-xs text-primary hover:underline"
          onClick={async () => {
            const fullPath = `${projectRoot}/CLAUDE.md`;
            try {
              const exists = await window.electronAPI.fsExists(fullPath);
              if (!exists) {
                await window.electronAPI.fsCreate(projectRoot, "CLAUDE.md", "");
              }
            } catch {}
            const docStore = useDocumentStore.getState();
            const file = docStore.files.find((f) => f.relativePath === "CLAUDE.md");
            if (file) docStore.setActiveFile(file.id);
          }}
        >
          Edit in editor
        </button>
      </div>

      {/* Context Component Toggles */}
      <div>
        <h3 className="text-sm font-medium mb-1">Context Components</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Enable or disable context injection for the AI agent. Changes take effect on the next message.
        </p>
        <div className="space-y-1.5">
          {(Object.keys(LABELS) as (keyof ContextToggles)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={() => handleToggle(key)}
                className="size-3.5 rounded border-border"
              />
              <span>{LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
