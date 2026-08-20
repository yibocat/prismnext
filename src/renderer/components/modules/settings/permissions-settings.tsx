import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  InfoIcon,
  Loader2Icon,
  ShieldIcon,
  XCircleIcon,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SmartPermissionAction } from "@shared/smart-permission-policy";
import { explainSmartPermissionAction } from "@shared/smart-permission-policy";
import {
  buildPermissionRulesFromSettings,
  resolvePermissionMode,
} from "@shared/permission-modes";
import type { PermissionRulesField } from "./permission-rules-editor-panel";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const OVERVIEW_BULLET_KEYS = [
  "settings.permissions.overviewBulletDefault",
  "settings.permissions.overviewBulletAllow",
  "settings.permissions.overviewBulletDeny",
  "settings.permissions.overviewBulletPrompt",
] as const;

const SYNTAX_EXAMPLE_KEYS = [
  "settings.permissions.syntaxExampleGit",
  "settings.permissions.syntaxExampleEdit",
  "settings.permissions.syntaxExampleDelete",
  "settings.permissions.syntaxExampleWeb",
] as const;

function settingsRecord(settings: object): Record<string, unknown> {
  return settings as Record<string, unknown>;
}

function formatTesterResult(
  action: string,
  source: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const actionLabel = t(`settings.permissions.testerAction.${action}`, { defaultValue: action });
  let sourceLabel: string;
  if (source.startsWith("deny_rule:")) {
    sourceLabel = t("settings.permissions.testerSource.denyRule", {
      rule: source.slice("deny_rule:".length),
    });
  } else {
    sourceLabel = t(`settings.permissions.testerSource.${source}`, { defaultValue: source });
  }
  return t("settings.permissions.testerResult", {
    action: actionLabel,
    source: sourceLabel,
  });
}

function PermissionRuleRow({
  title,
  description,
  summary,
  onOpen,
}: {
  title: string;
  description: string;
  summary: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className={SETTINGS_ROW}>
      <div className="min-w-0 flex-1 pr-4">
        <p className={SETTINGS_ROW_LABEL}>{title}</p>
        <p className={SETTINGS_ROW_DESC}>{description}</p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">{summary}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        {t("common.open")}
        <ChevronRightIcon className="size-3.5" />
      </button>
    </div>
  );
}

function TesterResultIcon({ action }: { action: SmartPermissionAction | null }) {
  if (action === "allow") {
    return <CheckCircle2Icon className="size-3 mr-1 text-success" />;
  }
  if (action === "deny") {
    return <XCircleIcon className="size-3 mr-1 text-destructive" />;
  }
  if (action === "prompt") {
    return <InfoIcon className="size-3 mr-1 text-muted-foreground" />;
  }
  return null;
}

export function PermissionsSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const rulesConfig = useMemo(
    () => buildPermissionRulesFromSettings(settingsRecord(settings)),
    [settings],
  );

  const [testTool, setTestTool] = useState("bash");
  const [testTarget, setTestTarget] = useState("git status");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testAction, setTestAction] = useState<SmartPermissionAction | null>(null);
  const [testing, setTesting] = useState(false);

  const readonly = resolvePermissionMode(settings.permissionMode) === "readonly";

  const allowedPathsCount = settings.permissionAllowedPaths?.length ?? 0;
  const allowRulesCount = rulesConfig.allowRules.length;
  const denyRulesCount = rulesConfig.denyRules.length;

  const openField = useCallback((field: PermissionRulesField) => {
    openSettingsPanel({ kind: "permission-rules", field });
  }, []);

  const handleReadonlyChange = useCallback(
    (checked: boolean) => {
      void updateSettings({ permissionMode: checked ? "readonly" : "edit_auto" });
    },
    [updateSettings],
  );

  const runTest = useCallback(() => {
    setTesting(true);
    try {
      const cfg = buildPermissionRulesFromSettings(settingsRecord(settings));
      const tool = testTool.trim().toLowerCase() || "bash";
      const isBash = tool === "bash" || tool === "experiment-run"
        || tool === "latex-compile" || tool === "latex-compile-standalone";
      const detail = explainSmartPermissionAction(
        {
          toolName: tool,
          projectRoot: projectRoot || null,
          bashCommand: isBash ? testTarget : null,
          bashCwd: projectRoot || null,
          filePath: isBash ? null : testTarget,
        },
        cfg,
      );
      setTestAction(detail.action);
      setTestResult(formatTesterResult(detail.action, detail.source, t));
    } finally {
      setTesting(false);
    }
  }, [projectRoot, settings, t, testTarget, testTool]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.permissions.title")}
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.permissions.subtitle")}
          </p>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.permissions.modeSection")}</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.readonlyTitle")}</p>
                <p className={SETTINGS_ROW_DESC}>{t("settings.permissions.readonlyDesc")}</p>
              </div>
              <Switch checked={readonly} onCheckedChange={handleReadonlyChange} />
            </div>
          </div>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.permissions.rulesSection")}</p>
          <p className={cn(SETTINGS_ROW_DESC, "mb-2")}>{t("settings.permissions.rulesSectionDesc")}</p>
          {projectRoot ? (
            <p className={cn(SETTINGS_ROW_DESC, "mb-2 font-mono text-[length:var(--font-size-11)]")}>
              {t("settings.permissions.projectRootHint", { path: projectRoot })}
            </p>
          ) : (
            <p className={cn(SETTINGS_ROW_DESC, "mb-2")}>{t("settings.permissions.noProjectHint")}</p>
          )}
          <div className={SETTINGS_CARD}>
            <PermissionRuleRow
              title={t("settings.permissions.allowedPaths")}
              description={t("settings.permissions.allowedPathsListDesc")}
              summary={
                allowedPathsCount > 0
                  ? t("settings.permissions.summaryPaths", { count: allowedPathsCount })
                  : t("settings.permissions.summaryEmpty")
              }
              onOpen={() => openField("allowed-paths")}
            />
            <PermissionRuleRow
              title={t("settings.permissions.allowRules")}
              description={t("settings.permissions.allowRulesListDesc")}
              summary={
                allowRulesCount > 0
                  ? t("settings.permissions.summaryRules", { count: allowRulesCount })
                  : t("settings.permissions.summaryEmpty")
              }
              onOpen={() => openField("allow-rules")}
            />
            <PermissionRuleRow
              title={t("settings.permissions.denyRules")}
              description={t("settings.permissions.denyRulesListDesc")}
              summary={
                denyRulesCount > 0
                  ? t("settings.permissions.summaryRules", { count: denyRulesCount })
                  : t("settings.permissions.summaryEmpty")
              }
              onOpen={() => openField("deny-rules")}
            />
          </div>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.permissions.testerSection")}</p>
          <p className={cn(SETTINGS_ROW_DESC, "mb-2")}>{t("settings.permissions.testerDesc")}</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.testerTool")}</p>
                <p className={SETTINGS_ROW_DESC}>{t("settings.permissions.testerToolHint")}</p>
              </div>
              <Input
                id="perm-test-tool"
                value={testTool}
                onChange={(e) => {
                  setTestTool(e.target.value);
                  setTestResult(null);
                  setTestAction(null);
                }}
                placeholder="bash"
                className="!h-7 !text-[length:var(--font-size-12)] w-44 shrink-0 font-mono"
              />
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.testerTarget")}</p>
                <p className={SETTINGS_ROW_DESC}>{t("settings.permissions.testerTargetHint")}</p>
              </div>
              <Input
                id="perm-test-target"
                value={testTarget}
                onChange={(e) => {
                  setTestTarget(e.target.value);
                  setTestResult(null);
                  setTestAction(null);
                }}
                placeholder="git status"
                className="!h-7 !text-[length:var(--font-size-12)] w-56 shrink-0 font-mono"
              />
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0 flex-1 pr-4">
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.testerRunLabel")}</p>
                <p className={SETTINGS_ROW_DESC}>
                  {testResult ?? t("settings.permissions.testerIdleHint")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={runTest}
                disabled={testing}
              >
                {testing ? (
                  <Loader2Icon className="size-3 animate-spin mr-1" />
                ) : (
                  <TesterResultIcon action={testAction} />
                )}
                {t("settings.permissions.testerRun")}
              </Button>
            </div>
          </div>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.permissions.referenceSection")}</p>
          <div className={SETTINGS_CARD}>
            <div className="py-3">
              <div className="flex items-start gap-3">
                <InfoIcon className="size-4 shrink-0 mt-0.5 text-muted-foreground opacity-60" />
                <div className="min-w-0 space-y-2">
                  <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.overviewSection")}</p>
                  <p className={SETTINGS_ROW_DESC}>{t("settings.permissions.overviewIntro")}</p>
                  <ul className="space-y-1.5 text-[length:var(--font-size-12)] text-muted-foreground list-disc pl-4">
                    {OVERVIEW_BULLET_KEYS.map((key) => (
                      <li key={key}>{t(key)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-t border-border py-3 space-y-4">
              <div>
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.docsBuiltinTitle")}</p>
                <p className={cn(SETTINGS_ROW_DESC, "mt-1")}>{t("settings.permissions.docsBuiltin")}</p>
              </div>
              <div>
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.docsPriorityTitle")}</p>
                <p className={cn(SETTINGS_ROW_DESC, "mt-1")}>{t("settings.permissions.docsPriority")}</p>
              </div>
              <div>
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.docsSyntaxTitle")}</p>
                <p className={cn(SETTINGS_ROW_DESC, "mt-1")}>{t("settings.permissions.docsSyntax")}</p>
                <ul className="mt-2 space-y-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
                  {SYNTAX_EXAMPLE_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.docsCommandsTitle")}</p>
                <p className={cn(SETTINGS_ROW_DESC, "mt-1")}>{t("settings.permissions.docsCommands")}</p>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <ShieldIcon className="size-3.5 shrink-0 mt-0.5 opacity-60" />
                <div className="min-w-0">
                  <p className={SETTINGS_ROW_LABEL}>{t("settings.permissions.docsExpertsTitle")}</p>
                  <p className={cn(SETTINGS_ROW_DESC, "mt-1")}>{t("settings.permissions.docsExperts")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
