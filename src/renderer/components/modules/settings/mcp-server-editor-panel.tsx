import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  entryToJsonSnippet,
  namedEntryFromBareConfig,
  parsePastedMcpJson,
  type McpServerEntry,
} from "@/lib/agent/mcp-config";
import {
  entryFieldValues,
  findPresetForEntry,
  presetToEntry,
} from "@/lib/agent/mcp-presets";
import { McpPresetFieldInputs } from "./mcp-preset-field-inputs";
import { cn } from "@/lib/utils";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

type McpServerSlot = Extract<SettingsPanelSlot, { kind: "mcp-server" }>;

export function McpServerEditorPanel({ slot }: { slot: McpServerSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const servers = useMcpServersStore((s) => s.servers);
  const loaded = useMcpServersStore((s) => s.loaded);
  const saving = useMcpServersStore((s) => s.saving);
  const persist = useMcpServersStore((s) => s.persist);

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<McpServerEntry | null>(null);
  const [configureValues, setConfigureValues] = useState<Record<string, string>>({});
  const [configureJson, setConfigureJson] = useState("");

  useEffect(() => {
    if (!loaded) {
      setLoading(true);
      return;
    }
    const found = servers.find((s) => s.name === slot.serverName) ?? null;
    if (!found) {
      toast.error(t("settings.editor.mcpServer.toast.notFound"));
      closePanel();
      return;
    }
    setEntry(found);
    const preset = findPresetForEntry(found);
    if (preset) {
      setConfigureValues(entryFieldValues(found, preset));
      setConfigureJson("");
    } else {
      setConfigureValues({});
      setConfigureJson(entryToJsonSnippet(found));
    }
    setLoading(false);
  }, [loaded, servers, slot.serverName, closePanel]);

  const preset = entry ? findPresetForEntry(entry) : undefined;
  const isCustom = entry && !preset;

  const handleSave = async () => {
    if (!projectRoot || !entry) return;

    let nextEntry: McpServerEntry | null = null;

    if (preset) {
      nextEntry = presetToEntry(preset, configureValues);
      if (nextEntry) nextEntry.enabled = entry.enabled;
    } else {
      try {
        const parsed = parsePastedMcpJson(configureJson);
        if (parsed.entries.length === 1) {
          nextEntry = { ...parsed.entries[0], enabled: entry.enabled };
        } else if (parsed.bareConfig) {
          nextEntry = namedEntryFromBareConfig(entry.name, parsed.bareConfig);
          if (nextEntry) nextEntry.enabled = entry.enabled;
        }
      } catch {
        toast.error(t("settings.editor.mcpServer.toast.invalidJson"));
        return;
      }
    }

    if (!nextEntry) {
      toast.error(t("settings.editor.mcpServer.toast.saveFailed"));
      return;
    }

    const next = servers.map((s) => (s.name === entry.name ? nextEntry! : s));
    await persist(projectRoot, next);
    toast.success(t("settings.editor.mcpServer.toast.updated"));
    closePanel();
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.mcpServer.openProject")}
      </div>
    );
  }

  if (loading || !entry) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.editor.mcpServer.loading")}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {preset
            ? t("settings.editor.mcpServer.introPreset", { name: preset.name })
            : t("settings.editor.mcpServer.introCustom")}
        </p>

        {preset ? (
          <McpPresetFieldInputs
            preset={preset}
            values={configureValues}
            onChange={(key, value) => setConfigureValues((v) => ({ ...v, [key]: value }))}
          />
        ) : (
          <div>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-1.5">
              {t("settings.editor.mcpServer.serverJson")}
            </p>
            <Textarea
              className={cn(
                SETTINGS_FORM_TEXTAREA,
                "min-h-48 font-mono !text-[length:var(--font-size-12)]",
              )}
              value={configureJson}
              onChange={(e) => setConfigureJson(e.target.value)}
            />
          </div>
        )}

        {isCustom ? (
          <Button
            variant="ghost"
            size="xs"
            className="px-0 h-auto text-primary hover:text-primary"
            onClick={() => openSettingsPanel({ kind: "mcp-json" })}
          >
            {t("settings.editor.mcpServer.openFullJson")}
          </Button>
        ) : null}

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {t("common.save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
