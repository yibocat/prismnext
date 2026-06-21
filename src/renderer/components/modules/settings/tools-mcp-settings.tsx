import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PlugIcon,
  ExternalLinkIcon,
  SearchIcon,
  EyeIcon,
  EyeOffIcon,
  FileJsonIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import {
  entryToJsonSnippet,
  mergeMcpEntries,
  namedEntryFromBareConfig,
  parseMcpConfig,
  parsePastedMcpJson,
  serializeMcpConfig,
  type McpServerEntry,
} from "@/lib/mcp-config";
import {
  MCP_PRESETS,
  MCP_CATEGORY_LABELS,
  findPresetForEntry,
  entryFieldValues,
  presetFieldsValid,
  presetRequiresFields,
  presetToEntry,
  type McpPreset,
} from "@/lib/mcp-presets";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

function serverSummary(entry: McpServerEntry): string {
  if (entry.type === "remote") return entry.url || "Remote server";
  if (entry.command.length === 0) return "Local process (stdio)";
  const cmd = entry.command.join(" ");
  return cmd.length > 72 ? `${cmd.slice(0, 72)}…` : cmd;
}

function PresetFieldInputs({
  preset,
  values,
  onChange,
}: {
  preset: McpPreset;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  if (!preset.fields?.length) return null;

  return (
    <div className="space-y-2 pt-1">
      {preset.fields.map((field) => (
        <div key={field.key}>
          <label className="text-[length:var(--font-size-12)] text-muted-foreground mb-1 block">
            {field.label}
            {field.required ? " *" : ""}
          </label>
          <div className="relative">
            <input
              type={field.secret && !visible[field.key] ? "password" : "text"}
              className={cn(INPUT, field.secret && "pr-9")}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
            {field.secret && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setVisible((v) => ({ ...v, [field.key]: !v[field.key] }))}
              >
                {visible[field.key] ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
      {preset.docsUrl && (
        <a
          href={preset.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[length:var(--font-size-11)] text-primary hover:underline"
        >
          Documentation <ExternalLinkIcon className="size-3" />
        </a>
      )}
    </div>
  );
}

export function ToolsMcpSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openFile = useRightPanelStore((s) => s.openFile);
  const mcpRelPath = ".prismnext/agent/mcp.json";
  const mcpPath = projectRoot ? `${projectRoot}/${mcpRelPath}` : "";

  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [catalogSearch, setCatalogSearch] = useState("");

  const [installPresetId, setInstallPresetId] = useState<string | null>(null);
  const [installValues, setInstallValues] = useState<Record<string, string>>({});

  const [configureName, setConfigureName] = useState<string | null>(null);
  const [configureValues, setConfigureValues] = useState<Record<string, string>>({});
  const [configureJson, setConfigureJson] = useState("");

  const [pasteText, setPasteText] = useState("");
  const [pasteBareName, setPasteBareName] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const deleteConfirm = useInlineDeleteConfirm();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

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

  const loadServers = useCallback(async () => {
    if (!projectRoot) {
      setServers([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    try {
      const exists = await window.electronAPI.fsExists(mcpPath);
      if (!exists) {
        setServers([]);
        return;
      }
      const result = await window.electronAPI.fsRead(mcpPath);
      setServers(parseMcpConfig(result?.content ?? ""));
    } catch {
      setServers([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot, mcpPath]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const persistServers = async (next: McpServerEntry[]) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.fsWrite(mcpPath, serializeMcpConfig(next));
      await window.electronAPI.chatPrewarm(projectRoot);
      setServers(next);
    } finally {
      setSaving(false);
    }
  };

  const openMcpJsonInEditor = () => {
    openFile(mcpRelPath, mcpRelPath, "mcp.json");
  };

  const closeCatalog = () => {
    setCatalogOpen(false);
    cancelInstall();
    setCatalogSearch("");
  };

  const openCatalog = () => {
    setConfigureName(null);
    setCatalogOpen(true);
  };

  const closePaste = () => {
    setPasteOpen(false);
    setPasteText("");
    setPasteBareName("");
    setPasteError(null);
  };

  const openPaste = () => {
    setConfigureName(null);
    setPasteOpen(true);
  };

  const startInstall = (preset: McpPreset) => {
    if (installedNames.has(preset.id)) return;
    setConfigureName(null);
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
    const entry = presetToEntry(preset, installValues);
    if (!entry) {
      toast.error("Fill in all required fields.");
      return;
    }
    await persistServers(mergeMcpEntries(servers, [entry]));
    cancelInstall();
    closeCatalog();
    toast.success(`${preset.name} added — start a new chat to use it.`);
  };

  const oneClickInstall = async (preset: McpPreset) => {
    if (presetRequiresFields(preset)) {
      startInstall(preset);
      return;
    }
    const entry = presetToEntry(preset);
    if (!entry) return;
    await persistServers(mergeMcpEntries(servers, [entry]));
    closeCatalog();
    toast.success(`${preset.name} installed — start a new chat to use it.`);
  };

  const openConfigure = (entry: McpServerEntry) => {
    deleteConfirm.clearPending();
    cancelInstall();
    setConfigureName(entry.name);
    const preset = findPresetForEntry(entry);
    if (preset) {
      setConfigureValues(entryFieldValues(entry, preset));
      setConfigureJson("");
    } else {
      setConfigureValues({});
      setConfigureJson(entryToJsonSnippet(entry));
    }
  };

  const cancelConfigure = () => {
    setConfigureName(null);
    setConfigureValues({});
    setConfigureJson("");
  };

  const saveConfigure = async () => {
    if (!configureName) return;
    const existing = servers.find((s) => s.name === configureName);
    if (!existing) return;

    const preset = findPresetForEntry(existing);
    let nextEntry: McpServerEntry | null = null;

    if (preset) {
      nextEntry = presetToEntry(preset, configureValues);
      if (nextEntry) nextEntry.enabled = existing.enabled;
    } else {
      try {
        const parsed = parsePastedMcpJson(configureJson);
        if (parsed.entries.length === 1) {
          nextEntry = { ...parsed.entries[0], enabled: existing.enabled };
        } else if (parsed.bareConfig) {
          nextEntry = namedEntryFromBareConfig(configureName, parsed.bareConfig);
          if (nextEntry) nextEntry.enabled = existing.enabled;
        }
      } catch {
        toast.error("Invalid JSON.");
        return;
      }
    }

    if (!nextEntry) {
      toast.error("Could not save — check the configuration.");
      return;
    }

    const next = servers.map((s) => (s.name === configureName ? nextEntry! : s));
    await persistServers(next);
    cancelConfigure();
    toast.success("MCP server updated.");
  };

  const handlePasteAdd = async () => {
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
      await persistServers(mergeMcpEntries(servers, [entry]));
      closePaste();
      toast.success(`Added "${entry.name}" — start a new chat to use it.`);
      return;
    }

    if (parsed.entries.length === 0) {
      setPasteError("No servers found in pasted JSON.");
      return;
    }

    await persistServers(mergeMcpEntries(servers, parsed.entries));
    closePaste();
    toast.success(
      parsed.entries.length === 1
        ? `Added "${parsed.entries[0].name}" — start a new chat to use it.`
        : `Added ${parsed.entries.length} servers — start a new chat to use them.`,
    );
  };

  const pasteNeedsName = useMemo(() => {
    if (!pasteText.trim()) return false;
    const parsed = parsePastedMcpJson(pasteText);
    return Boolean(parsed.bareConfig);
  }, [pasteText]);

  const handleToggleEnabled = async (name: string, enabled: boolean) => {
    deleteConfirm.clearPending();
    const next = servers.map((s) => (s.name === name ? { ...s, enabled } : s));
    await persistServers(next);
  };

  const handleDelete = async (name: string) => {
    deleteConfirm.clearPending();
    if (configureName === name) cancelConfigure();
    await persistServers(servers.filter((s) => s.name !== name));
    toast.success(`Removed "${name}".`);
  };

  const renderCatalogDialog = () => (
    <Dialog
      open={catalogOpen}
      onOpenChange={(open) => {
        if (open) setCatalogOpen(true);
        else closeCatalog();
      }}
    >
      <DialogContent className="w-[560px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">
            Browse MCP catalog
          </DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
          One-click install common servers. Requires npx on your machine.
        </p>
        <div className="relative shrink-0">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            className={cn(INPUT, "pl-8")}
            placeholder="Search MCP servers…"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
          />
        </div>
        <div className={cn(CARD, "flex-1 min-h-0 overflow-y-auto !px-0")}>
          {filteredPresets.length === 0 ? (
            <div className="py-8 text-center text-[length:var(--font-size-12)] text-muted-foreground">
              No matches.
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const installed = installedNames.has(preset.id);
              const installing = installPresetId === preset.id;
              return (
                <div key={preset.id}>
                  <div className={cn(ROW, "px-4")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={ROW_LABEL}>{preset.name}</span>
                        <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                          {MCP_CATEGORY_LABELS[preset.category]}
                        </span>
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
                      <PresetFieldInputs
                        preset={preset}
                        values={installValues}
                        onChange={(key, value) =>
                          setInstallValues((v) => ({ ...v, [key]: value }))
                        }
                      />
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="xs"
                          disabled={saving || !presetFieldsValid(preset, installValues)}
                          onClick={() => void confirmInstall(preset)}
                        >
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
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderAddButtons = (className?: string) => (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="xs" onClick={openCatalog}>
        <PlusIcon className="size-3 mr-1" />
        Browse catalog
      </Button>
      <Button variant="outline" size="xs" onClick={openPaste}>
        <FileJsonIcon className="size-3 mr-1" />
        Add from JSON
      </Button>
    </div>
  );

  const renderPasteDialog = () => (
    <Dialog
      open={pasteOpen}
      onOpenChange={(open) => {
        if (open) setPasteOpen(true);
        else closePaste();
      }}
    >
      <DialogContent className="w-[560px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">
            Add from JSON
          </DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
          Paste a snippet from docs — full{" "}
          <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">mcpServers</code>
          , a name → config map, or a single server object.
        </p>
        <Textarea
          className="flex-1 min-h-48 !field-sizing-fixed font-mono !text-[length:var(--font-size-12)] resize-y bg-background"
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
        {pasteError && (
          <p className="text-[length:var(--font-size-12)] text-destructive">{pasteError}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="xs" onClick={closePaste} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={() => void handlePasteAdd()}
            disabled={saving || !pasteText.trim()}
          >
            Parse and add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderInstalled = () => (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className={cn(CATEGORY_HEADER, "mb-0")}>Installed</p>
        {renderAddButtons("shrink-0")}
      </div>
      <div className={CARD}>
        {!loaded ? (
          <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">Loading…</div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <PlugIcon className="size-8 text-muted-foreground/30" />
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">
              No MCP servers yet.
            </p>
            {renderAddButtons()}
          </div>
        ) : (
          servers.map((entry) => {
            const configuring = configureName === entry.name;
            const preset = findPresetForEntry(entry);

            return (
              <div key={entry.name}>
                <div className={ROW}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(ROW_LABEL, "font-mono")}>{entry.name}</span>
                      <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{entry.type}</span>
                      {!entry.enabled && (
                        <span className={cn(BADGE, "bg-muted/60 text-muted-foreground/70")}>off</span>
                      )}
                    </div>
                    <p className={ROW_DESC}>{serverSummary(entry)}</p>
                  </div>
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={(v) => void handleToggleEnabled(entry.name, v)}
                    disabled={saving}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0"
                    disabled={saving}
                    onClick={() => {
                      deleteConfirm.clearPending();
                      if (configuring) cancelConfigure();
                      else openConfigure(entry);
                    }}
                  >
                    {configuring ? "Close" : "Configure"}
                  </Button>
                  <InlineDeleteButton
                    itemId={entry.name}
                    pending={deleteConfirm.isPending(entry.name)}
                    disabled={saving}
                    onRequest={() => deleteConfirm.setPendingId(entry.name)}
                    onConfirm={() => void handleDelete(entry.name)}
                  />
                </div>
                {configuring && (
                  <div className="pb-3 border-t border-border/50">
                    {preset ? (
                      <PresetFieldInputs
                        preset={preset}
                        values={configureValues}
                        onChange={(key, value) =>
                          setConfigureValues((v) => ({ ...v, [key]: value }))
                        }
                      />
                    ) : (
                      <div className="pt-2">
                        <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-1">
                          Server JSON
                        </p>
                        <Textarea
                          className="min-h-32 font-mono !text-[length:var(--font-size-12)] resize-y"
                          value={configureJson}
                          onChange={(e) => setConfigureJson(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button size="xs" onClick={() => void saveConfigure()} disabled={saving}>
                        Save
                      </Button>
                      <Button variant="ghost" size="xs" onClick={cancelConfigure} disabled={saving}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">MCP</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Extend the agent with external tools and data sources.
            </p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={openMcpJsonInEditor}>
              <FileJsonIcon className="size-3 mr-1" />
              Open mcp.json
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <PlugIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                Open a project to manage MCP servers.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-4">
              Saved to{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/mcp.json
              </code>
              . New chat tabs pick up changes.
            </p>
            {renderInstalled()}
            {renderCatalogDialog()}
            {renderPasteDialog()}
          </>
        )}
      </div>
    </div>
  );
}
