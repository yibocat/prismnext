import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import { mergeMcpEntries } from "@/lib/agent/mcp-config";
import {
  MCP_PRESETS,
  MCP_CATEGORY_LABELS,
  presetFieldsValid,
  presetRequiresFields,
  presetToEntry,
  type McpPreset,
} from "@/lib/agent/mcp-presets";
import { McpPresetFieldInputs } from "./mcp-preset-field-inputs";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const CARD = "rounded-lg border border-border divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 px-4 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

export function McpCatalogPanel() {
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const servers = useMcpServersStore((s) => s.servers);
  const saving = useMcpServersStore((s) => s.saving);
  const persist = useMcpServersStore((s) => s.persist);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [installPresetId, setInstallPresetId] = useState<string | null>(null);
  const [installValues, setInstallValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setCatalogSearch("");
    setInstallPresetId(null);
    setInstallValues({});
  }, []);

  const installedNames = useMemo(() => new Set(servers.map((s) => s.name)), [servers]);

  const filteredPresets = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return MCP_PRESETS;
    return MCP_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        MCP_CATEGORY_LABELS[p.category].toLowerCase().includes(q),
    );
  }, [catalogSearch]);

  const recommendedPresets = useMemo(
    () => filteredPresets.filter((p) => p.recommended),
    [filteredPresets],
  );
  const morePresets = useMemo(
    () => filteredPresets.filter((p) => !p.recommended),
    [filteredPresets],
  );

  const startInstall = (preset: McpPreset) => {
    setInstallPresetId(preset.id);
    const initial: Record<string, string> = {};
    for (const field of preset.fields ?? []) {
      if (field.key === "__path__" && projectRoot) {
        initial[field.key] = projectRoot;
      }
    }
    setInstallValues(initial);
  };

  const cancelInstall = () => {
    setInstallPresetId(null);
    setInstallValues({});
  };

  const confirmInstall = async (preset: McpPreset) => {
    if (!projectRoot) return;
    const entry = presetToEntry(preset, installValues);
    if (!entry) {
      toast.error("Fill in all required fields.");
      return;
    }
    await persist(projectRoot, mergeMcpEntries(servers, [entry]));
    cancelInstall();
    toast.success(`${preset.name} added — start a new chat to use it.`);
    closePanel();
  };

  const oneClickInstall = async (preset: McpPreset) => {
    if (!projectRoot) return;
    if (presetRequiresFields(preset)) {
      startInstall(preset);
      return;
    }
    const entry = presetToEntry(preset);
    if (!entry) return;
    await persist(projectRoot, mergeMcpEntries(servers, [entry]));
    toast.success(`${preset.name} installed — start a new chat to use it.`);
    closePanel();
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to browse the MCP catalog.
      </div>
    );
  }

  const renderPreset = (preset: McpPreset) => {
    const installed = installedNames.has(preset.id);
    const installing = installPresetId === preset.id;
    return (
      <div key={preset.id}>
        <div className={ROW}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={ROW_LABEL}>{preset.name}</span>
              <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                {MCP_CATEGORY_LABELS[preset.category]}
              </span>
              {preset.recommended ? (
                <span className={cn(BADGE, "bg-primary/10 text-primary normal-case tracking-normal")}>
                  Recommended
                </span>
              ) : null}
            </div>
            <p className={ROW_DESC}>{preset.description}</p>
          </div>
          {installed ? (
            <span className={cn(BADGE, "bg-primary/10 text-primary")}>Installed</span>
          ) : (
            <Button
              variant="outline"
              size="xs"
              disabled={saving}
              onClick={() => void oneClickInstall(preset)}
            >
              Install
            </Button>
          )}
        </div>
        {installing && !installed && (
          <div className="px-4 pb-3 border-t border-border/50">
            <McpPresetFieldInputs
              preset={preset}
              values={installValues}
              onChange={(key, value) => setInstallValues((v) => ({ ...v, [key]: value }))}
            />
            <div className="flex gap-2 mt-3">
              <Button
                size="xs"
                disabled={saving || !presetFieldsValid(preset, installValues)}
                onClick={() => void confirmInstall(preset)}
              >
                {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
                Add to project
              </Button>
              <Button variant="ghost" size="xs" onClick={cancelInstall} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPresetSection = (title: string, presets: McpPreset[]) => {
    if (presets.length === 0) return null;
    return (
      <section className="space-y-2">
        <h3 className={SETTINGS_CATEGORY_HEADER}>{title}</h3>
        <div className={CARD}>{presets.map(renderPreset)}</div>
      </section>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          Curated MCP servers for research workflows. Requires npx on your machine. Literature search
          and citations stay in Prism built-in tools — use MCP for web, repos, and data stores.
        </p>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            className={cn(INPUT, "pl-8")}
            placeholder="Search MCP servers…"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
          />
        </div>
        {filteredPresets.length === 0 ? (
          <div className={cn(CARD, "py-8 text-center text-[length:var(--font-size-12)] text-muted-foreground")}>
            No matches.
          </div>
        ) : (
          <div className="space-y-5">
            {renderPresetSection("Recommended", recommendedPresets)}
            {renderPresetSection("More", morePresets)}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="xs" onClick={closePanel}>
            Close
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openSettingsPanel({ kind: "mcp-paste-json" })}
          >
            Add from JSON instead
          </Button>
        </div>
      </div>
    </div>
  );
}
