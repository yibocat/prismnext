import { useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import {
  mergeMcpEntries,
  namedEntryFromBareConfig,
  parsePastedMcpJson,
} from "@/lib/agent/mcp-config";
import { cn } from "@/lib/utils";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

export function McpPasteJsonPanel() {
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const servers = useMcpServersStore((s) => s.servers);
  const saving = useMcpServersStore((s) => s.saving);
  const persist = useMcpServersStore((s) => s.persist);

  const [pasteText, setPasteText] = useState("");
  const [pasteBareName, setPasteBareName] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const pasteNeedsName = useMemo(() => {
    if (!pasteText.trim()) return false;
    const parsed = parsePastedMcpJson(pasteText);
    return Boolean(parsed.bareConfig);
  }, [pasteText]);

  const handlePasteAdd = async () => {
    if (!projectRoot) return;
    setPasteError(null);
    const parsed = parsePastedMcpJson(pasteText);

    if (parsed.error === "invalid_json") {
      setPasteError("Invalid JSON — check brackets and quotes.");
      return;
    }
    if (parsed.error === "invalid_format") {
      setPasteError("Unrecognized format. Paste mcpServers, a name → config map, or a single server block.");
      return;
    }
    if (parsed.error === "empty") {
      setPasteError("Nothing to add.");
      return;
    }

    if (parsed.bareConfig) {
      const name = pasteBareName.trim();
      const entry = namedEntryFromBareConfig(name, parsed.bareConfig);
      if (!entry) {
        setPasteError("Enter a valid server name (letters, numbers, hyphens).");
        return;
      }
      await persist(projectRoot, mergeMcpEntries(servers, [entry]));
      toast.success(`Added "${entry.name}" — start a new chat to use it.`);
      closePanel();
      return;
    }

    if (parsed.entries.length === 0) {
      setPasteError("No servers found in pasted JSON.");
      return;
    }

    await persist(projectRoot, mergeMcpEntries(servers, parsed.entries));
    toast.success(
      parsed.entries.length === 1
        ? `Added "${parsed.entries[0].name}" — start a new chat to use it.`
        : `Added ${parsed.entries.length} servers — start a new chat to use them.`,
    );
    closePanel();
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to add MCP servers.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          Paste a snippet from docs — full{" "}
          <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">mcpServers</code>
          , a name → config map, or a single server object.
        </p>
        <Textarea
          className={cn(
            SETTINGS_FORM_TEXTAREA,
            "min-h-48 !field-sizing-fixed font-mono !text-[length:var(--font-size-12)]",
          )}
          placeholder={`{\n  "mcpServers": {\n    "github": {\n      "type": "local",\n      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],\n      "environment": { "GITHUB_PERSONAL_ACCESS_TOKEN": "…" }\n    }\n  }\n}`}
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            setPasteError(null);
          }}
        />
        {pasteNeedsName && (
          <input
            type="text"
            className={INPUT}
            placeholder="Server name (e.g. my-custom-mcp)"
            value={pasteBareName}
            onChange={(e) => setPasteBareName(e.target.value)}
          />
        )}
        {pasteError ? (
          <p className="text-[length:var(--font-size-12)] text-destructive">{pasteError}</p>
        ) : null}
        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button
            size="xs"
            onClick={() => void handlePasteAdd()}
            disabled={saving || !pasteText.trim()}
          >
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            Parse and add
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
