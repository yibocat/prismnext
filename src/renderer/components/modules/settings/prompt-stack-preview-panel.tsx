import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTeamsStore } from "@/stores/teams-store";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { formatTokenCount } from "@shared/providers/token-estimate";
import { PromptInternalsNotice } from "./prompt-internals-notice";
import { SettingsModulePromptPreview } from "./settings-module-prompt-preview";
import {
  fetchPromptStackPreview,
  subscribeExpertsIntegrationChanged,
  type PromptStackPreview,
  type PromptStackSection,
} from "@/lib/settings";
import { teamDisplayName } from "@/lib/teams/team-display-name";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

/** Section id → role key under settings.editor.promptStack.role.* */
const SECTION_ROLE_KEY: Record<string, "opencode" | "eachTurn" | "orchestrator" | "internal"> = {
  "host-identity": "opencode",
  "prism-system": "opencode",
  "agents-md": "opencode",
  "orchestrator-agent": "orchestrator",
  "profile-modules": "internal",
  "task-roster": "opencode",
  "project-rules": "eachTurn",
};

type StackPreview = PromptStackPreview;
type StackSection = PromptStackSection;

function StackSectionCard({
  section,
  index,
  showFull,
  expanded,
  onToggle,
}: {
  section: StackSection;
  index: number;
  showFull: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const empty = !section.content.trim();
  const roleKey = SECTION_ROLE_KEY[section.id];

  const header = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(BADGE, "bg-muted text-muted-foreground normal-case tracking-normal")}>
          {t("settings.editor.promptStack.layer", { n: index + 1 })}
        </span>
        {roleKey ? (
          <span
            className={cn(
              BADGE,
              "bg-muted text-muted-foreground normal-case tracking-normal",
            )}
          >
            {t(`settings.editor.promptStack.role.${roleKey}`)}
          </span>
        ) : null}
        <p className="text-[length:var(--font-size-13)] font-medium">{section.label}</p>
        <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 tabular-nums">
          {t("settings.editor.promptStack.tokens", {
            count: formatTokenCount(section.tokenCount),
          })}
        </span>
      </div>
      <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-snug">
        <span className="font-medium text-muted-foreground/90">
          {t("settings.editor.promptStack.injectVia")}{" "}
        </span>
        {section.injectPath}
      </p>
      {section.fileHint ? (
        <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 truncate">
          {section.fileHint}
        </p>
      ) : null}
      {!showFull && empty ? (
        <p className="text-[length:var(--font-size-11)] text-muted-foreground italic">
          {t("settings.editor.promptStack.emptyContent")}
        </p>
      ) : null}
    </div>
  );

  if (!showFull) {
    return (
      <article className="rounded-lg border border-border px-4 py-3">
        {header}
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </span>
        {header}
      </button>
      {expanded ? (
        <div className="border-t border-border px-4 py-3">
          {empty ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground italic">
              {t("settings.editor.promptStack.emptyContent")}
            </p>
          ) : (
            <SettingsModulePromptPreview
              content={section.content}
              shellClassName="min-h-0 rounded-none border-0 px-0 py-0"
            />
          )}
        </div>
      ) : null}
    </article>
  );
}

export function PromptStackPreviewPanel() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const agentSystemPrompt = useSettingsStore((s) => s.settings.agentSystemPrompt) ?? "";
  const showFull = useSettingsStore((s) => s.settings.showPromptInternals === true);
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const loadTeams = useTeamsStore((s) => s.load);

  const [preview, setPreview] = useState<StackPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const loadPreview = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        const data = await fetchPromptStackPreview(
          projectRoot,
          agentSystemPrompt || undefined,
          activeTeamId,
        );
        setPreview(data);
        setExpandedIds((prev) => {
          if (prev.size > 0) return prev;
          const first = data.sections[0]?.id;
          return first ? new Set([first]) : new Set();
        });
      } catch {
        toast.error(t("settings.editor.promptStack.toast.loadFailed"));
        setPreview(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectRoot, agentSystemPrompt, activeTeamId, t],
  );

  useEffect(() => {
    if (projectRoot) void loadTeams(projectRoot);
  }, [projectRoot, loadTeams]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    return subscribeExpertsIntegrationChanged(projectRoot, () => {
      void loadPreview({ silent: true });
    });
  }, [projectRoot, loadPreview]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPreview({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!preview) return;
    setExpandedIds(new Set(preview.sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.promptStack.loadError")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
            {t("settings.editor.promptStack.refresh")}
          </Button>
          {showFull ? (
            <>
              <Button variant="ghost" size="xs" onClick={expandAll}>
                {t("settings.editor.promptStack.expandAll")}
              </Button>
              <Button variant="ghost" size="xs" onClick={collapseAll}>
                {t("settings.editor.promptStack.collapseAll")}
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[length:var(--font-size-11)] text-muted-foreground tabular-nums">
          <span>
            {t("settings.editor.promptStack.totalTokens", {
              count: formatTokenCount(preview.totalTokenCount),
            })}
          </span>
          <span>
            {t("settings.editor.promptStack.layerCount", { count: preview.sections.length })}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className={SETTINGS_DETAIL_SHELL}>
          <PromptInternalsNotice variant={showFull ? "developer" : "summary"} />
          <div className="space-y-1">
            <p className={SETTINGS_ROW_DESC}>
              {t(
                showFull
                  ? "settings.editor.promptStack.introFull"
                  : "settings.editor.promptStack.intro",
              )}
            </p>
            {preview.orchestratorName && preview.orchestratorId ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {preview.teamId || preview.teamName ? (
                  <>
                    {t("settings.editor.promptStack.activeTeam")}{" "}
                    <span className="font-medium text-foreground/90">
                      {teamDisplayName(preview.teamId ?? "", preview.teamName, t)}
                    </span>
                    {" · "}
                  </>
                ) : null}
                {t("settings.editor.promptStack.leadAgent")}{" "}
                <span className="font-medium text-foreground/90">{preview.orchestratorName}</span>{" "}
                <code className="text-[length:var(--font-size-11)]">{preview.orchestratorId}</code>
              </p>
            ) : !projectRoot ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground italic">
                {t("settings.editor.promptStack.openProject")}
              </p>
            ) : null}
          </div>

          <section className="space-y-3">
            <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.editor.promptStack.layers")}</h3>
            {preview.sections.map((section, index) => (
              <StackSectionCard
                key={section.id}
                section={section}
                index={index}
                showFull={showFull}
                expanded={expandedIds.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
