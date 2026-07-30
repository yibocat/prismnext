import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { permissionGatedToolsByGroup } from "@shared/permission-tool-catalog";
import {
  formatAllowRulesText,
  formatAllowedPathsText,
  parseAllowedPathsLines,
  parsePermissionRuleLines,
  splitAllowRulesText,
} from "@shared/permission-rules";
import { buildPermissionRulesFromSettings } from "@shared/permission-modes";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

export type PermissionRulesField = "allowed-paths" | "allow-rules" | "deny-rules";

type PermissionRulesSlot = Extract<SettingsPanelSlot, { kind: "permission-rules" }>;

const ALLOW_EXAMPLE_KEYS = [
  "settings.permissions.syntaxExampleGit",
  "settings.permissions.syntaxExampleEdit",
  "settings.permissions.syntaxExampleWeb",
] as const;

const DENY_EXAMPLE_KEYS = [
  "settings.permissions.syntaxExampleDenyBash",
  "settings.permissions.syntaxExampleDenyDelete",
] as const;

function loadFieldText(
  field: PermissionRulesField,
  settings: ReturnType<typeof useSettingsStore.getState>["settings"],
): string {
  const rulesConfig = buildPermissionRulesFromSettings(settingsRecord(settings));
  switch (field) {
    case "allowed-paths":
      return formatAllowedPathsText(settings.permissionAllowedPaths);
    case "allow-rules":
      return formatAllowRulesText(rulesConfig);
    case "deny-rules":
      return (settings.permissionDenyRules ?? []).join("\n");
  }
}

function settingsRecord(settings: object): Record<string, unknown> {
  return settings as Record<string, unknown>;
}

function PermissionGatedToolNamesList() {
  const { t } = useTranslation();
  const groups = useMemo(() => permissionGatedToolsByGroup(), []);

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <div>
        <p className="text-[length:var(--font-size-12)] font-medium text-foreground">
          {t("settings.permissions.toolsCatalog.section")}
        </p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground mt-0.5">
          {t("settings.permissions.toolsCatalog.sectionDesc")}
        </p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/80 mt-1.5">
          {t("settings.permissions.toolsCatalog.alwaysAllowedNote")}
        </p>
      </div>
      {groups.map(({ group, tools }) => (
        <div key={group}>
          <p className="text-[length:var(--font-size-10)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
            {t(`settings.permissions.toolsCatalog.groups.${group}`)}
          </p>
          <div className="space-y-0.5">
            {tools.map((name) => (
              <div
                key={name}
                className="flex items-baseline gap-2 text-[length:var(--font-size-11)]"
              >
                <code className="shrink-0 font-mono text-foreground/90 min-w-[7.5rem]">{name}</code>
                <span className="text-muted-foreground">
                  {t(`settings.permissions.toolsCatalog.items.${name}`, { defaultValue: name })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PermissionRulesEditorPanel({ slot }: { slot: PermissionRulesSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const field = slot.field;

  const [text, setText] = useState(() =>
    loadFieldText(field, useSettingsStore.getState().settings),
  );
  const [saving, setSaving] = useState(false);

  const placeholder = useMemo(() => {
    switch (field) {
      case "allowed-paths":
        return t("settings.permissions.allowedPathsPlaceholder");
      case "allow-rules":
        return t("settings.permissions.allowRulesPlaceholder");
      case "deny-rules":
        return t("settings.permissions.denyRulesPlaceholder");
    }
  }, [field, t]);

  useEffect(() => {
    setText(loadFieldText(field, useSettingsStore.getState().settings));
  }, [field]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (field === "allowed-paths") {
        const parsed = parseAllowedPathsLines(text);
        if (parsed.errors.length > 0) {
          const first = parsed.errors[0]!;
          toast.error(t("settings.permissions.saveErrorLine", {
            line: first.line,
            message: first.message,
          }));
          return;
        }
        await updateSettings({ permissionAllowedPaths: parsed.paths });
      } else if (field === "allow-rules") {
        const split = splitAllowRulesText(text);
        if (split.errors.length > 0) {
          const first = split.errors[0]!;
          toast.error(t("settings.permissions.saveErrorLine", {
            line: first.line,
            message: first.message,
          }));
          return;
        }
        await updateSettings({
          permissionAllowRules: split.permissionAllowRules,
          bashAllowAlwaysPatterns: split.bashAllowAlwaysPatterns,
          toolAllowAlways: split.toolAllowAlways,
        });
      } else {
        const parsed = parsePermissionRuleLines(text);
        if (parsed.errors.length > 0) {
          const first = parsed.errors[0]!;
          toast.error(t("settings.permissions.saveErrorLine", {
            line: first.line,
            message: first.message,
          }));
          return;
        }
        await updateSettings({
          permissionDenyRules: parsed.rules.map((r) => r.raw),
        });
      }
      toast.success(t("settings.permissions.saveSuccess"));
      closePanel();
    } finally {
      setSaving(false);
    }
  }, [closePanel, field, t, text, updateSettings]);

  const exampleKeys =
    field === "allow-rules"
      ? ALLOW_EXAMPLE_KEYS
      : field === "deny-rules"
        ? DENY_EXAMPLE_KEYS
        : null;

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t(`settings.permissions.editor.${field}.intro`)}</p>

        <Textarea
          id={`perm-editor-${field}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className={cn(
            SETTINGS_FORM_TEXTAREA,
            "min-h-[14rem] font-mono !text-[length:var(--font-size-12)]",
          )}
        />

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void handleSave()} disabled={saving}>
            {t("common.save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            {t("common.cancel")}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-3">
          <p className="text-[length:var(--font-size-13)] font-medium text-foreground">
            {t(`settings.permissions.editor.${field}.helpTitle`)}
          </p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
            {t(`settings.permissions.editor.${field}.helpBody`)}
          </p>
          {exampleKeys ? (
            <ul className="space-y-1 font-mono text-[length:var(--font-size-11)] text-muted-foreground">
              {exampleKeys.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          ) : null}
          {field === "allowed-paths" ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
              {t("settings.permissions.editor.allowed-paths.helpNote")}
            </p>
          ) : null}
          {field !== "allowed-paths" ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
              {t("settings.permissions.editor.syntaxHint")}
            </p>
          ) : null}
          {field === "allow-rules" || field === "deny-rules" ? (
            <PermissionGatedToolNamesList />
          ) : null}
        </div>
      </div>
    </div>
  );
}
