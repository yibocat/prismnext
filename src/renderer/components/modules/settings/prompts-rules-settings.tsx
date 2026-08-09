import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { formatTokenCount } from "@shared/token-estimate";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { notifyPromptConfigChanged } from "@/lib/settings/prompt-config-notify";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
/** Prompt rows: wrap action buttons below text when the panel is narrow. */
const PROMPT_ROW = "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5";
const PROMPT_ROW_BODY = "min-w-0 flex-1 basis-[min(100%,12rem)]";
const PROMPT_ROW_ACTIONS = "flex flex-wrap items-center gap-2 shrink-0 ml-auto";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide";

function ProjectRulesSection() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [rules, setRules] = useState<
    Awaited<ReturnType<typeof window.electronAPI.agentListRules>>
  >([]);
  const [busy, setBusy] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const loadRules = useCallback(async () => {
    if (!projectRoot) {
      setRules([]);
      return;
    }
    try {
      setRules(await window.electronAPI.agentListRules(projectRoot));
    } catch {
      setRules([]);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useOnSettingsEditorKindsClosed(["rule-markdown"], () => {
    void loadRules();
  });

  const handleToggleRule = async (id: string, enabled: boolean) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    setBusy(true);
    try {
      await window.electronAPI.agentSetRuleEnabled(projectRoot, id, enabled);
      notifyPromptConfigChanged();
    } catch {
      await loadRules();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setBusy(true);
    try {
      await window.electronAPI.agentDeleteRule(projectRoot, id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      notifyPromptConfigChanged();
    } finally {
      setBusy(false);
    }
  };

  const openRule = (rule: (typeof rules)[number]) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "rule-markdown",
      mode: "edit",
      ruleId: rule.id,
      title: rule.name,
    });
  };

  if (!projectRoot) {
    return (
      <div className={CARD}>
        <div className={cn(ROW, "!block")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("settings.prompts.empty.openForRules")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      {rules.length === 0 ? (
        <div className={cn(ROW, "!block")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("settings.prompts.empty.noRules")}
          </p>
        </div>
      ) : (
        rules.map((rule) => (
          <div key={rule.id} className={ROW}>
            <button
              type="button"
              className="min-w-0 flex-1 pr-4 text-left"
              onClick={() => openRule(rule)}
            >
              <div className="flex items-center gap-2">
                <p className={ROW_LABEL}>{rule.name}</p>
                <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                  {t("settings.prompts.customBadge")}
                </span>
              </div>
              <p className={cn(ROW_DESC, "truncate")}>
                {rule.description || t("common.noDescription")}
              </p>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => openRule(rule)}>
                {t("common.edit")}
              </Button>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(v) => void handleToggleRule(rule.id, v)}
              />
              <InlineDeleteButton
                itemId={rule.id}
                pending={deleteConfirm.isPending(rule.id)}
                disabled={busy}
                stopPropagation
                onRequest={() => deleteConfirm.setPendingId(rule.id)}
                onConfirm={() => void confirmDelete(rule.id)}
              />
            </div>
          </div>
        ))
      )}
      <div className="py-2.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => openSettingsPanel({ kind: "rule-markdown", mode: "new" })}
        >
          {t("settings.prompts.addRule")}
        </Button>
      </div>
    </div>
  );
}

export function PromptsRulesSettings() {
  const { t } = useTranslation();
  const agentSystemPrompt = useSettingsStore((s) => s.settings.agentSystemPrompt) ?? "";
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const isCustom = agentSystemPrompt.trim().length > 0;
  const [stackSummary, setStackSummary] = useState<{
    stableTokens: number;
    sectionCount: number;
    orchestratorName?: string;
  } | null>(null);
  const [agentsMdLength, setAgentsMdLength] = useState(0);
  const [hasAgentsMd, setHasAgentsMd] = useState(false);
  const [internalsSummary, setInternalsSummary] = useState<{
    moduleCount: number;
    toolCount: number;
  } | null>(null);

  const agentsMdPath = projectRoot
    ? `${projectRoot.replace(/[/\\]+$/, "")}/.prismnext/agent/AGENTS.md`
    : "";

  const refreshSummaries = useCallback(async () => {
    try {
      const stack = await window.electronAPI.settingsGetPromptStackPreview(
        projectRoot ?? undefined,
        agentSystemPrompt || undefined,
      );
      const stable = stack.sections.find((s) => s.id === "prism-system");
      setStackSummary({
        stableTokens: stable?.tokenCount ?? 0,
        sectionCount: stack.sections.length,
        orchestratorName: stack.orchestratorName,
      });
    } catch {
      setStackSummary(null);
    }

    if (!projectRoot) {
      setAgentsMdLength(0);
      setHasAgentsMd(false);
      return;
    }
    try {
      const exists = await window.electronAPI.fsExists(agentsMdPath);
      if (!exists) {
        setAgentsMdLength(0);
        setHasAgentsMd(false);
        return;
      }
      const r = await window.electronAPI.fsRead(agentsMdPath);
      const content = r?.content || "";
      setAgentsMdLength(content.length);
      setHasAgentsMd(content.trim().length > 0);
    } catch {
      setAgentsMdLength(0);
      setHasAgentsMd(false);
    }

    try {
      const [modules, tools] = await Promise.all([
        window.electronAPI.settingsGetKnowledgeModules(projectRoot ?? undefined),
        window.electronAPI.settingsGetBuiltinTools(),
      ]);
      setInternalsSummary({
        moduleCount: modules.length,
        toolCount: tools.length,
      });
    } catch {
      setInternalsSummary(null);
    }
  }, [projectRoot, agentSystemPrompt, agentsMdPath]);

  useEffect(() => {
    void refreshSummaries();
  }, [refreshSummaries]);

  // Live-update when main process re-syncs experts (e.g. the default main
  // agent changed) — otherwise the base-agent summary stays stale until the
  // page is reopened or a settings editor closes.
  useEffect(() => {
    const unsubscribe = window.electronAPI.onExpertsIntegrationChanged(({ projectPath }) => {
      if (!projectRoot || projectPath !== projectRoot) return;
      void refreshSummaries();
    });
    return unsubscribe;
  }, [projectRoot, refreshSummaries]);

  useOnSettingsEditorKindsClosed(["prompt-markdown", "prompt-stack-preview", "rule-markdown"], () => {
    void refreshSummaries();
  });

  const openSystemPrompt = () => {
    openSettingsPanel({ kind: "prompt-markdown", doc: "system-prompt" });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.prompts.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.prompts.pageDesc")}
          </p>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.prompts.sectionPrompts")}</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            {t("settings.prompts.sectionPromptsDesc")}
          </p>
          <div className={CARD}>
            <div className={PROMPT_ROW}>
              <div className={PROMPT_ROW_BODY}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className={ROW_LABEL}>{t("settings.prompts.systemPrompt")}</p>
                  {isCustom ? (
                    <span className={cn(BADGE, "bg-primary/10 text-primary normal-case tracking-normal")}>
                      {t("settings.prompts.customBadge")}
                    </span>
                  ) : null}
                </div>
                <p className={ROW_DESC}>
                  {isCustom
                    ? t("settings.prompts.rowDesc.customPrompt")
                    : t("settings.prompts.rowDesc.builtinPrompt")}
                </p>
              </div>
              <div className={PROMPT_ROW_ACTIONS}>
                <Button variant="ghost" size="xs" className="shrink-0" onClick={openSystemPrompt}>
                  {isCustom
                    ? t("settings.prompts.viewEditPrompt")
                    : t("settings.prompts.customPrompt")}
                </Button>
              </div>
            </div>

            <div className={PROMPT_ROW}>
              <div className={PROMPT_ROW_BODY}>
                <p className={ROW_LABEL}>{t("settings.prompts.projectInstructions")}</p>
                {!projectRoot ? (
                  <p className={ROW_DESC}>{t("settings.prompts.rowDesc.openForInstructions")}</p>
                ) : (
                  <>
                    <p className={ROW_DESC}>{t("settings.prompts.rowDesc.instructions")}</p>
                    <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">
                      {hasAgentsMd
                        ? t("settings.prompts.rowDesc.agentsChars", {
                            count: agentsMdLength.toLocaleString(),
                          })
                        : t("settings.prompts.rowDesc.noAgents")}
                    </p>
                  </>
                )}
              </div>
              {projectRoot ? (
                <div className={PROMPT_ROW_ACTIONS}>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0"
                    onClick={() =>
                      openSettingsPanel({ kind: "prompt-markdown", doc: "agents-md" })
                    }
                  >
                    {hasAgentsMd
                      ? t("settings.prompts.editInstructions")
                      : t("settings.prompts.createAgentsMd")}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className={PROMPT_ROW}>
              <div className={PROMPT_ROW_BODY}>
                <p className={ROW_LABEL}>{t("settings.prompts.researchBrief")}</p>
                {!projectRoot ? (
                  <p className={ROW_DESC}>{t("settings.prompts.rowDesc.openForBrief")}</p>
                ) : (
                  <p className={ROW_DESC}>{t("settings.prompts.rowDesc.brief")}</p>
                )}
              </div>
              {projectRoot ? (
                <div className={PROMPT_ROW_ACTIONS}>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0"
                    onClick={() => openSettingsPanel({ kind: "research-brief" })}
                  >
                    {t("settings.prompts.viewBrief")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.prompts.sectionAdvanced")}</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            {t("settings.prompts.sectionAdvancedDesc")}
          </p>
          {stackSummary ? (
            <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mb-2">
              {t("settings.prompts.advancedSummary", {
                layers: stackSummary.sectionCount,
                modules: internalsSummary?.moduleCount ?? "—",
                tools: internalsSummary?.toolCount ?? "—",
              })}
            </p>
          ) : null}
          <div className={CARD}>
            <div className={ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={ROW_LABEL}>{t("settings.prompts.previewStack")}</p>
                  <span className={cn(BADGE, "bg-muted text-muted-foreground normal-case tracking-normal")}>
                    {t("common.readOnly")}
                  </span>
                </div>
                <p className={ROW_DESC}>
                  {stackSummary
                    ? t("settings.prompts.rowDesc.stackSummary", {
                        tokens: formatTokenCount(stackSummary.stableTokens),
                        layers: stackSummary.sectionCount,
                      })
                    : t("settings.prompts.rowDesc.openForStack")}
                </p>
                {stackSummary?.orchestratorName ? (
                  <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">
                    {t("settings.prompts.stackBaseAgent", {
                      name: stackSummary.orchestratorName,
                    })}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                disabled={!stackSummary}
                onClick={() => openSettingsPanel({ kind: "prompt-stack-preview" })}
              >
                {t("settings.prompts.previewStack")}
              </Button>
            </div>

            <div className={ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={ROW_LABEL}>{t("settings.prompts.builtinModules")}</p>
                  <span className={cn(BADGE, "bg-muted text-muted-foreground normal-case tracking-normal")}>
                    {t("common.readOnly")}
                  </span>
                </div>
                <p className={ROW_DESC}>{t("settings.prompts.rowDesc.modules")}</p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                onClick={() => openSettingsPanel({ kind: "knowledge-modules" })}
              >
                {t("settings.prompts.viewModules")}
              </Button>
            </div>

            <div className={ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={ROW_LABEL}>{t("settings.prompts.builtinTools")}</p>
                  <span className={cn(BADGE, "bg-muted text-muted-foreground normal-case tracking-normal")}>
                    {t("common.readOnly")}
                  </span>
                </div>
                <p className={ROW_DESC}>{t("settings.prompts.rowDesc.tools")}</p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                onClick={() => openSettingsPanel({ kind: "agent-tools" })}
              >
                {t("settings.prompts.viewTools")}
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.prompts.projectRules")}</h3>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            {t("settings.prompts.rulesDesc")}
          </p>
          <ProjectRulesSection />
        </div>
      </div>
    </div>
  );
}
