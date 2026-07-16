import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import {
  mergeMcpEntries,
  namedEntryFromBareConfig,
  parsePastedMcpJson,
} from "@/lib/agent/mcp-config";
import { SettingsJsonEditor } from "./settings-json-editor";
import { SettingsJsonToolbar } from "./settings-json-toolbar";
import {
  SETTINGS_DETAIL_SHELL,
  SETTINGS_LABEL_RESET_ICON,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const NAME_INPUT =
  "h-6 w-44 shrink-0 rounded border border-input bg-transparent px-2 text-[length:var(--font-size-12)] outline-none focus:border-primary/40";

const EXAMPLE_MCPSERVERS = `{
  "mcpServers": {
    "fetch": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}`;

const EXAMPLE_NAME_MAP = `{
  "github": {
    "type": "local",
    "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
    "environment": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_…" }
  }
}`;

const EXAMPLE_SINGLE_BLOCK = `{
  "type": "local",
  "command": ["npx", "-y", "@modelcontextprotocol/server-memory"]
}`;

export function McpPasteJsonPanel() {
  const { t } = useTranslation();
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
      setPasteError(t("settings.editor.mcpPaste.errorInvalidJson"));
      return;
    }
    if (parsed.error === "invalid_format") {
      setPasteError(t("settings.editor.mcpPaste.errorInvalidFormat"));
      return;
    }
    if (parsed.error === "empty") {
      setPasteError(t("settings.editor.mcpPaste.errorEmpty"));
      return;
    }

    if (parsed.bareConfig) {
      const name = pasteBareName.trim();
      const entry = namedEntryFromBareConfig(name, parsed.bareConfig);
      if (!entry) {
        setPasteError(t("settings.editor.mcpPaste.errorName"));
        return;
      }
      await persist(projectRoot, mergeMcpEntries(servers, [entry]));
      toast.success(t("settings.editor.mcpPaste.toastAddedOne", { name: entry.name }));
      closePanel();
      return;
    }

    if (parsed.entries.length === 0) {
      setPasteError(t("settings.editor.mcpPaste.errorNoServers"));
      return;
    }

    await persist(projectRoot, mergeMcpEntries(servers, parsed.entries));
    toast.success(
      parsed.entries.length === 1
        ? t("settings.editor.mcpPaste.toastAddedOne", { name: parsed.entries[0].name })
        : t("settings.editor.mcpPaste.toastAddedMany", { count: parsed.entries.length }),
    );
    closePanel();
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.mcpPaste.openProject")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-auto">
      <SettingsJsonToolbar
        primaryLabel={t("settings.editor.mcpPaste.parseAdd")}
        onPrimary={() => void handlePasteAdd()}
        onCancel={closePanel}
        disabled={!pasteText.trim()}
        saving={saving}
        trailing={
          pasteNeedsName ? (
            <input
              type="text"
              className={NAME_INPUT}
              placeholder={t("settings.editor.mcpPaste.serverName")}
              value={pasteBareName}
              onChange={(e) => setPasteBareName(e.target.value)}
              aria-label={t("settings.editor.mcpPaste.serverNameAria")}
            />
          ) : null
        }
      />
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.mcpPaste.intro")}</p>

        {pasteError ? (
          <p className="text-[length:var(--font-size-12)] text-destructive">{pasteError}</p>
        ) : null}

        <SettingsJsonEditor
          variant="field"
          value={pasteText}
          onChange={(v) => {
            setPasteText(v);
            setPasteError(null);
          }}
        />

        <section className="space-y-3 pt-1">
          <p className="text-[length:var(--font-size-12)] font-medium text-foreground/90">
            {t("settings.editor.mcpPaste.examples")}
          </p>
          <div className="space-y-2">
            <FormatHint
              title={t("settings.editor.mcpPaste.exampleWrapper")}
              example={EXAMPLE_MCPSERVERS}
            />
            <FormatHint
              title={t("settings.editor.mcpPaste.exampleNameMap")}
              example={EXAMPLE_NAME_MAP}
            />
            <FormatHint
              title={t("settings.editor.mcpPaste.exampleSingle")}
              example={EXAMPLE_SINGLE_BLOCK}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function FormatHint({ title, example }: { title: string; example: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("settings.editor.mcpJson.toast.copyFailed"));
    }
  };

  return (
    <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[length:var(--font-size-11)] text-muted-foreground min-w-0">{title}</p>
        <button
          type="button"
          className={SETTINGS_LABEL_RESET_ICON}
          onClick={() => void handleCopy()}
          title={copied ? t("common.copied") : t("settings.editor.mcp.copyExample")}
          aria-label={copied ? t("common.copied") : t("settings.editor.mcp.copyExample")}
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-success" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto font-mono text-[length:var(--font-size-11)] leading-relaxed text-foreground/85 whitespace-pre-wrap">
        {example}
      </pre>
    </div>
  );
}
