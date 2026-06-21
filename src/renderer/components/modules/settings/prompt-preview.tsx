// prism-next/src/renderer/components/modules/settings/prompt-preview.tsx

import { useState, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";

export function PromptPreview() {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const text =
        await window.electronAPI.settingsGetAssembledPrompt(
          projectRoot ?? undefined,
        );
      setPreview(text);
    } catch {
      setPreview("Failed to load preview.");
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => {
          if (!expanded && !preview) loadPreview();
          setExpanded(!expanded);
        }}
        className="text-sm font-medium hover:underline"
      >
        {expanded ? "▾" : "▸"} Assembled Prompt Preview
      </button>

      {expanded && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : (
            <>
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 text-[11px] whitespace-pre-wrap">
                {preview || "(empty)"}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                >
                  Copy
                </button>
                <button
                  onClick={loadPreview}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
