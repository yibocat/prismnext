import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useDocumentStore } from "@/stores/document-store";
import {
  createWorkspaceFolders,
  useWorkspaceConfigStore,
} from "@/stores/workspace-config-store";
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

function getViewLabels(t: TFunction): Record<TexworkspaceViewMode, string> {
  return {
    split: t("settings.texWorkspacePage.viewSplit"),
    tex: t("settings.texWorkspacePage.viewTex"),
    pdf: t("settings.texWorkspacePage.viewPdf"),
  };
}

function StatusValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[length:var(--font-size-12)] font-medium shrink-0 max-w-[12rem] truncate text-right">
      {children}
    </span>
  );
}

function ManuscriptSection() {
  const { t } = useTranslation();
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
    ? t("common.loading")
    : templateMeta?.name ?? templateId ?? t("settings.texWorkspacePage.none");

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
          <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.openProject")}</p>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className={SETTINGS_CARD}>
        <div className="py-4 px-1">
          <p className={SETTINGS_ROW_DESC}>{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!manuscript) {
    return (
      <div className={SETTINGS_CARD}>
        <div className={SETTINGS_ROW}>
          <div className="min-w-0">
            <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.folder")}</span>
            <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.noManuscript")}</p>
          </div>
          <SettingsInlineLink onClick={openWorkspaceSettings}>
            {t("settings.texWorkspacePage.workspaceSettings")}
          </SettingsInlineLink>
        </div>
      </div>
    );
  }

  const mainTex = "mainTex" in manuscript ? manuscript.mainTex : "main.tex";

  return (
    <div className={SETTINGS_CARD}>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.folder")}</span>
          <p className={SETTINGS_ROW_DESC}>
            {t("settings.texWorkspacePage.folderDescPrefix")}{" "}
            <SettingsInlineLink onClick={openWorkspaceSettings}>
              {t("settings.texWorkspacePage.workspaceSettings")}
            </SettingsInlineLink>
            {t("settings.texWorkspacePage.folderDescSuffix")}
          </p>
        </div>
        <StatusValue>{manuscript.name}</StatusValue>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.mainFile")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.mainFileDesc")}</p>
        </div>
        <StatusValue>
          <span className="font-mono text-[var(--color-primary)]">{mainTex}</span>
        </StatusValue>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.template")}</span>
          <p className={SETTINGS_ROW_DESC}>
            {templateId
              ? (templateMeta?.description ?? t("settings.texWorkspacePage.appliedViaCenter"))
              : t("settings.texWorkspacePage.noTemplate")}{" "}
            {t("settings.texWorkspacePage.templateChangePrefix")}{" "}
            <SettingsInlineLink onClick={openTemplateCenter}>
              {t("settings.texWorkspacePage.templateCenter")}
            </SettingsInlineLink>
            {t("settings.texWorkspacePage.templateChangeSuffix")}
          </p>
        </div>
        <StatusValue>{templateLabel}</StatusValue>
      </div>
    </div>
  );
}

export function TexworkspaceSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const workspaceDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const loaded = useWorkspaceConfigStore((s) => s.loaded);
  const saveConfig = useWorkspaceConfigStore((s) => s.saveConfig);
  const defaultViewMode = useLayoutStore((s) => s.texworkspaceDefaultViewMode);
  const setTexworkspaceDefaultViewMode = useLayoutStore((s) => s.setTexworkspaceDefaultViewMode);
  const { reload: reloadProjectTemplate } = useProjectTemplate();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewLabels = getViewLabels(t);

  useEffect(() => {
    if (!loaded || !projectRoot) return;
    const capturedRoot = projectRoot;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const ok = await saveConfig(capturedRoot);
      if (ok) {
        await createWorkspaceFolders(capturedRoot, dirs);
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
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.texWorkspacePage.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.texWorkspacePage.pageDesc")}
          </p>
        </div>

        <div>
          <p className={SECTION_HEADER}>{t("settings.texWorkspacePage.manuscript")}</p>
          <p className={SECTION_DESC}>{t("settings.texWorkspacePage.manuscriptDesc")}</p>
          <ManuscriptSection />
        </div>

        <div>
          <p className={SECTION_HEADER}>{t("settings.texWorkspacePage.layout")}</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.defaultView")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.defaultViewDesc")}</p>
              </div>
              <AppSelect
                value={defaultViewMode}
                onValueChange={(v) => setTexworkspaceDefaultViewMode(v as TexworkspaceViewMode)}
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {(Object.keys(viewLabels) as TexworkspaceViewMode[]).map((mode) => (
                    <AppSelectItem key={mode} value={mode}>
                      {viewLabels[mode]}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION_HEADER}>{t("settings.texWorkspacePage.compileSection")}</p>
          <CompileSettingsFields />
        </div>

        <div>
          <p className={SECTION_HEADER}>{t("settings.texWorkspacePage.backups")}</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.templateSnapshots")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.templateSnapshotsDesc")}</p>
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
          <p className={SECTION_HEADER}>{t("settings.texWorkspacePage.references")}</p>
          <p className={SECTION_DESC}>{t("settings.texWorkspacePage.referencesDesc")}</p>
          <div className={SETTINGS_CARD}>
            <div className="py-4 px-1 flex items-start gap-3 text-muted-foreground">
              <BookOpenIcon className="size-4 shrink-0 mt-0.5 opacity-60" />
              <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.referencesNote")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
