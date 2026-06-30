import { useState, useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useLayoutStore, type TexworkspaceViewMode } from "@/stores/layout-store";
import { getTemplates } from "@/lib/templates/template-data";
import type { TemplateMeta } from "@/components/modules/templates/types";
import { useProjectTemplate } from "@/hooks/use-project-template";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { CompileSettingsFields } from "./compile-settings-fields";
import { BackupsSettingsPanel } from "./backups-settings-panel";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";
import { BookOpenIcon } from "lucide-react";

const SECTION_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";

const SECTION_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mb-2";

const SETTINGS_LINK = "text-primary hover:underline underline-offset-2";

function SettingsInlineLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={SETTINGS_LINK} onClick={onClick}>
      {children}
    </button>
  );
}

const VIEW_LABELS: Record<TexworkspaceViewMode, string> = {
  split: "Split (TeX + PDF)",
  tex: "TeX only",
  pdf: "PDF only",
};

function StatusValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[length:var(--font-size-12)] font-medium shrink-0 max-w-[12rem] truncate text-right">
      {children}
    </span>
  );
}

function ManuscriptSection() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { workspaceDirs, loaded } = useWorkspaceConfigStore();
  const { state: templateState, loading: templateLoading } = useProjectTemplate();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);

  useEffect(() => {
    void getTemplates().then(setTemplates);
  }, []);

  const manuscript = workspaceDirs.find((d) => d.function === "manuscript") ?? null;
  const templateId = templateState?.id ?? null;
  const templateMeta = templateId ? templates.find((t) => t.id === templateId) : null;
  const templateLabel = templateLoading
    ? "Loading…"
    : templateMeta?.name ?? templateId ?? "None";

  const openWorkspaceSettings = () => {
    useLayoutStore.getState().setSettingsCategory("workspace");
  };

  const openTemplateCenter = () => {
    useLayoutStore.getState().setLeftSidebarView("templates");
    useLayoutStore.getState().setLeftSidebarOverlay(false);
  };

  if (!projectRoot) {
    return (
      <div className={SETTINGS_CARD}>
        <div className="py-4 px-1">
          <p className={SETTINGS_ROW_DESC}>Open a project to configure the manuscript folder.</p>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className={SETTINGS_CARD}>
        <div className="py-4 px-1">
          <p className={SETTINGS_ROW_DESC}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!manuscript) {
    return (
      <div className={SETTINGS_CARD}>
        <div className={SETTINGS_ROW}>
          <div className="min-w-0">
            <span className={SETTINGS_ROW_LABEL}>Folder</span>
            <p className={SETTINGS_ROW_DESC}>No manuscript folder is bound yet.</p>
          </div>
          <SettingsInlineLink onClick={openWorkspaceSettings}>Workspace settings</SettingsInlineLink>
        </div>
      </div>
    );
  }

  const mainTex = "mainTex" in manuscript ? manuscript.mainTex : "main.tex";

  return (
    <div className={SETTINGS_CARD}>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Folder</span>
          <p className={SETTINGS_ROW_DESC}>
            Edit folder name and main file in{" "}
            <SettingsInlineLink onClick={openWorkspaceSettings}>Workspace settings</SettingsInlineLink>.
          </p>
        </div>
        <StatusValue>{manuscript.name}</StatusValue>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Main file</span>
          <p className={SETTINGS_ROW_DESC}>
            Compile entry point relative to the manuscript folder — does not rename files on disk.
          </p>
        </div>
        <StatusValue>
          <span className="font-mono text-[var(--color-primary)]">{mainTex}</span>
        </StatusValue>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Template</span>
          <p className={SETTINGS_ROW_DESC}>
            {templateId
              ? (templateMeta?.description ?? `Applied via Template Center`)
              : "No template applied yet."}{" "}
            Change in{" "}
            <SettingsInlineLink onClick={openTemplateCenter}>Template Center</SettingsInlineLink>.
          </p>
        </div>
        <StatusValue>{templateLabel}</StatusValue>
      </div>
    </div>
  );
}

export function TexworkspaceSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const loaded = useWorkspaceConfigStore((s) => s.loaded);
  const saveConfig = useWorkspaceConfigStore((s) => s.saveConfig);
  const defaultViewMode = useLayoutStore((s) => s.texworkspaceDefaultViewMode);
  const setTexworkspaceDefaultViewMode = useLayoutStore((s) => s.setTexworkspaceDefaultViewMode);
  const { reload: reloadProjectTemplate } = useProjectTemplate();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loaded || !projectRoot) return;
    const capturedRoot = projectRoot;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const ok = await saveConfig(capturedRoot);
      if (ok) {
        await window.electronAPI.workspaceCreateFolders(capturedRoot, dirs);
      }
    }, 300);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [workspaceDirs, loaded, projectRoot, saveConfig]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">TeX Workspace</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Manuscript binding, compilation, backups, and layout for LaTeX writing.
          </p>
        </div>

        <div>
          <p className={SECTION_HEADER}>Manuscript</p>
          <p className={SECTION_DESC}>
            Current manuscript binding and template status for this project.
          </p>
          <ManuscriptSection />
        </div>

        <div>
          <p className={SECTION_HEADER}>Layout</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>Default view</span>
                <p className={SETTINGS_ROW_DESC}>Panel layout when entering TeX Workspace.</p>
              </div>
              <AppSelect
                value={defaultViewMode}
                onValueChange={(v) => setTexworkspaceDefaultViewMode(v as TexworkspaceViewMode)}
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {(Object.keys(VIEW_LABELS) as TexworkspaceViewMode[]).map((mode) => (
                    <AppSelectItem key={mode} value={mode}>
                      {VIEW_LABELS[mode]}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION_HEADER}>Compile</p>
          <CompileSettingsFields />
        </div>

        <div>
          <p className={SECTION_HEADER}>Backups</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>Template snapshots</span>
                <p className={SETTINGS_ROW_DESC}>
                  Created in{" "}
                  <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
                    .prismnext/backups/
                  </code>{" "}
                  when switching templates. Delete old snapshots to free disk space.
                </p>
              </div>
            </div>
            <div className="pb-3 pt-0.5">
              <BackupsSettingsPanel
                compact
                embedded
                onRestored={() => void reloadProjectTemplate()}
              />
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION_HEADER}>References</p>
          <p className={SECTION_DESC}>
            Manage citations and reading notes in{" "}
            <span className="text-foreground/85">Literature</span> mode (right panel). Zotero sync
            is configured from the Literature library sidebar when a project is open.
          </p>
          <div className={SETTINGS_CARD}>
            <div className="py-4 px-1 flex items-start gap-3 text-muted-foreground">
              <BookOpenIcon className="size-4 shrink-0 mt-0.5 opacity-60" />
              <p className={SETTINGS_ROW_DESC}>
                BibTeX export and manuscript citation checks live in the TeX workspace compile flow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
