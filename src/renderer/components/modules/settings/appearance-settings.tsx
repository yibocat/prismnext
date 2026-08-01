// components/modules/settings/appearance-settings.tsx
// Card-based layout matching Shortcuts settings — categorized, consistent rows, no <hr> dividers.
// Each setting row has a hover-visible reset-to-default button next to its control (right side).

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, Decoration } from "@codemirror/view";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import { RotateCcwIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { useThemeStore } from "@/stores/theme-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getDefaultThemeConfig } from "@/lib/theme/theme-generator";
import { GLASS_TIER_LABELS, type GlassTier } from "@/lib/theme/glass-system";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EditorThemePicker } from "./editor-theme-picker";
import { SystemFontPicker } from "./system-font-picker";
import {
  THEME_PACK_IDS,
  getThemePack,
  type ThemePackId,
} from "@/lib/theme/theme-packs";
import {
  CHAT_HOME_BACKDROP_LABEL_KEYS,
  CHAT_HOME_BACKDROP_STYLE_OPTIONS,
} from "@/lib/chat/home-backdrops/registry";
import type { ChatHomeBackdropSetting, ChatHomeBackdropStyle } from "@/lib/chat/home-backdrops/types";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_RESET_ICON,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
  SETTINGS_STEPPER,
  SETTINGS_STEPPER_BTN,
} from "./settings-tokens";

const RADIUS_LEVELS = [
  { value: "0", labelKey: "settings.appearance.radius.sharp" },
  { value: "0.375", labelKey: "settings.appearance.radius.small" },
  { value: "0.525", labelKey: "settings.appearance.radius.medium" },
  { value: "0.625", labelKey: "settings.appearance.radius.default" },
  { value: "0.775", labelKey: "settings.appearance.radius.large" },
  { value: "0.975", labelKey: "settings.appearance.radius.full" },
];

type MessageWidth = "narrow" | "balanced" | "wide";
const MESSAGE_WIDTH_TIERS: { value: MessageWidth; labelKey: string }[] = [
  { value: "narrow", labelKey: "settings.appearance.messageWidthNarrow" },
  { value: "balanced", labelKey: "settings.appearance.messageWidthBalanced" },
  { value: "wide", labelKey: "settings.appearance.messageWidthWide" },
];

const UI_FONT_SIZES = ["14px", "15px", "16px", "17px", "18px", "19px", "20px"] as const;
const EDITOR_FONT_SIZES = ["12px", "13px", "14px", "15px", "16px", "17px", "18px"] as const;

function cycleSize(current: string, dir: 1 | -1, sizes: readonly string[]): string {
  const i = sizes.indexOf(current as any);
  if (i < 0) return sizes[Math.floor(sizes.length / 2)];
  const next = i + dir;
  if (next < 0 || next >= sizes.length) return current;
  return sizes[next];
}

const CARD = SETTINGS_CARD;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;
const CATEGORY_HEADER = SETTINGS_CATEGORY_HEADER;
const RESET_ICON = SETTINGS_RESET_ICON;
const STEPPER = SETTINGS_STEPPER;
const STEPPER_BTN = SETTINGS_STEPPER_BTN;

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const config = useThemeStore((s) => s.config);
  const updateConfig = useThemeStore((s) => s.updateConfig);
  const glassEffect = config.glassEffect;
  const defaults = getDefaultThemeConfig();
  const messageWidth = useSettingsStore((s) => s.settings.messageWidth ?? "balanced");
  const chatHomeBackdropEnabled =
    useSettingsStore((s) => s.settings.chatHomeBackdropEnabled ?? true);
  const chatHomeBackdrop =
    useSettingsStore((s) => s.settings.chatHomeBackdrop ?? "auto");
  const chatHomeBackdropStyleValue: ChatHomeBackdropSetting | ChatHomeBackdropStyle =
    chatHomeBackdrop === "none" ? "auto" : chatHomeBackdrop;
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // ── CodeMirror preview (read-only Python sample) ──
  const previewCode = `import numpy as np\nx=np.array([1, 2])\nx=np.array([1, 2, 3])`;
  const editorPreviewRef = useRef<HTMLDivElement>(null);
  const editorPreviewViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const container = editorPreviewRef.current;
    if (!container) return;
    editorPreviewViewRef.current?.destroy();

    const lines = previewCode.split("\n");
    const line2Pos = lines[0].length + 1;
    const line3Pos = line2Pos + lines[1].length + 1;

    const state = EditorState.create({
      doc: previewCode,
      extensions: [
        EditorState.readOnly.of(true),
        python(),
        syntaxHighlighting(defaultHighlightStyle),
        lineNumbers({
          formatNumber: (n) => {
            if (n === 2) return "-";
            if (n === 3) return "+";
            return n.toString();
          },
        }),
        EditorView.decorations.of(
          Decoration.set([
            Decoration.line({ class: "cm-diff-removed" }).range(line2Pos),
            Decoration.line({ class: "cm-diff-added" }).range(line3Pos),
          ]),
        ),
        EditorView.theme({
          "&": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
          },
          ".cm-content": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
          },
          ".cm-gutters": {
            fontFamily: "var(--font-editor)",
            fontSize: "var(--font-editor-size)",
            backgroundColor: "transparent",
            color: "var(--muted-foreground)",
            borderRight: "1px solid var(--border)",
          },
          ".cm-diff-added": { backgroundColor: "rgba(40,167,69,0.1)" },
          ".cm-diff-removed": { backgroundColor: "rgba(220,53,69,0.1)" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    editorPreviewViewRef.current = view;
    return () => {
      view.destroy();
      editorPreviewViewRef.current = null;
    };
  }, [config.editorFontFamily, config.editorFontSize]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* ── Header ── */}
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.appearance.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.appearance.subtitle")}
          </p>
        </div>

        {/* ── Color ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.appearance.theme")}</h3>
          <div className={CARD}>
            {/* Theme Mode */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.themeMode")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.themeModeDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                  onClick={() => setTheme("system")}
                >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <AppSelect value={theme} onValueChange={(v) => setTheme(v)}>
                  <AppSelectTrigger className="w-24">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="dark">{t("settings.appearance.dark")}</AppSelectItem>
                    <AppSelectItem value="light">{t("settings.appearance.light")}</AppSelectItem>
                    <AppSelectItem value="system">{t("settings.appearance.system")}</AppSelectItem>
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>

            {/* Theme Pack */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.themePack")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.themePackDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                    onClick={() => updateConfig({ themePack: defaults.themePack })}
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <AppSelect
                  value={config.themePack}
                  onValueChange={(v) => updateConfig({ themePack: v as ThemePackId })}
                >
                  <AppSelectTrigger className="w-44">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {THEME_PACK_IDS.map((id) => {
                      const pack = getThemePack(id);
                      return (
                        <AppSelectItem key={id} value={id}>
                          <span className="flex items-center gap-2">
                            <span className="flex gap-0.5">
                              {pack.swatches.light.slice(0, 4).map((c, i) => (
                                <span
                                  key={i}
                                  className="inline-block size-2.5 rounded-sm"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </span>
                            {t(pack.labelKey)}
                          </span>
                        </AppSelectItem>
                      );
                    })}
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>

            {/* Intensity tiers removed - each pack is a single designed palette */}
          </div>
        </div>

        {/* ── Chat Layout ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.appearance.chatLayout")}</h3>
          <div className={CARD}>
            {/* Message Width — 3 tiers (narrow 42rem / balanced 48rem / wide 64rem) */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.messageWidth")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.messageWidthDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                    onClick={() =>
                      void updateSettings({ messageWidth: "balanced" })
                    }
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <AppSelect
                  value={messageWidth}
                  onValueChange={(v) =>
                    void updateSettings({ messageWidth: v as MessageWidth })
                  }
                >
                  <AppSelectTrigger className="w-32">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {MESSAGE_WIDTH_TIERS.map((tier) => (
                      <AppSelectItem key={tier.value} value={tier.value}>
                        {t(tier.labelKey)}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>

            {/* Chat homepage backdrop */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.chatHomeBackdrop")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.chatHomeBackdropDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                    onClick={() =>
                      void updateSettings({ chatHomeBackdropEnabled: true })
                    }
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <Switch
                  checked={chatHomeBackdropEnabled}
                  onCheckedChange={(v) =>
                    void updateSettings({ chatHomeBackdropEnabled: v })
                  }
                />
              </div>
            </div>

            <div
              className={cn(
                "flex items-center justify-between py-2.5 group transition-opacity duration-200",
                !chatHomeBackdropEnabled && "opacity-40 pointer-events-none",
              )}
            >
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.chatHomeBackdropStyle")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.chatHomeBackdropStyleDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                    onClick={() => void updateSettings({ chatHomeBackdrop: "auto" })}
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <AppSelect
                  value={chatHomeBackdropStyleValue}
                  onValueChange={(v) =>
                    void updateSettings({
                      chatHomeBackdrop: v as ChatHomeBackdropSetting,
                    })
                  }
                >
                  <AppSelectTrigger className="w-40">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="auto">
                      {t("settings.appearance.chatHomeBackdropDefault")}
                    </AppSelectItem>
                    {CHAT_HOME_BACKDROP_STYLE_OPTIONS.map((id) => (
                      <AppSelectItem key={id} value={id}>
                        {t(CHAT_HOME_BACKDROP_LABEL_KEYS[id])}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>
          </div>
        </div>

        {/* ── Typography ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.appearance.typography")}</h3>
          <div className={CARD}>
            {/* UI Font */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.uiFont")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.uiFontDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                  onClick={() =>
                    updateConfig({ fontSans: defaults.fontSans, uiFontSize: defaults.uiFontSize })
                  }
                >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <div className="flex gap-2">
                  <SystemFontPicker
                    value={config.fontSans}
                    onChange={(v) => updateConfig({ fontSans: v })}
                    triggerClassName="w-44"
                  />
                  <div className={STEPPER}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn("rounded-r-none", STEPPER_BTN)}
                      onClick={() =>
                        updateConfig({ uiFontSize: cycleSize(config.uiFontSize, -1, UI_FONT_SIZES) })
                      }
                    >
                      −
                    </Button>
                    <span className="text-[length:var(--font-size-12)] w-7 text-center tabular-nums text-muted-foreground">
                      {config.uiFontSize}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn("rounded-l-none", STEPPER_BTN)}
                      onClick={() =>
                        updateConfig({ uiFontSize: cycleSize(config.uiFontSize, 1, UI_FONT_SIZES) })
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Code Font */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.editorFont")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.editorFontDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                  onClick={() =>
                    updateConfig({
                      editorFontFamily: defaults.editorFontFamily,
                      fontMono: defaults.fontMono,
                      editorFontSize: defaults.editorFontSize,
                    })
                  }
                >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <div className="flex gap-2">
                  <SystemFontPicker
                    value={config.editorFontFamily}
                    onChange={(v) => updateConfig({ editorFontFamily: v, fontMono: v })}
                    preferMono
                    triggerClassName="w-44"
                  />
                  <div className={STEPPER}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn("rounded-r-none", STEPPER_BTN)}
                      onClick={() =>
                        updateConfig({
                          editorFontSize: cycleSize(config.editorFontSize, -1, EDITOR_FONT_SIZES),
                        })
                      }
                    >
                      −
                    </Button>
                    <span className="text-[length:var(--font-size-12)] w-7 text-center tabular-nums text-muted-foreground">
                      {config.editorFontSize}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={cn("rounded-l-none", STEPPER_BTN)}
                      onClick={() =>
                        updateConfig({
                          editorFontSize: cycleSize(config.editorFontSize, 1, EDITOR_FONT_SIZES),
                        })
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Editor Font Preview */}
            <div className="py-2.5">
              <div
                ref={editorPreviewRef}
                className="rounded-md border border-input bg-background overflow-hidden"
              />
            </div>
          </div>
        </div>

        {/* ── Editor Syntax Theme ── */}
        <EditorThemePicker />

        {/* ── Surface ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.appearance.surface")}</h3>
          <div className={CARD}>
            {/* Border Radius */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.borderRadius")}</p>
                <p className={ROW_DESC}>{t("settings.appearance.borderRadiusDesc")}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                  onClick={() => updateConfig({ radius: defaults.radius })}
                >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <AppSelect
                  value={config.radius.toString()}
                  onValueChange={(v) => updateConfig({ radius: parseFloat(v) })}
                >
                  <AppSelectTrigger className="w-28">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {RADIUS_LEVELS.map((l) => (
                      <AppSelectItem key={l.value} value={l.value}>
                        {t(l.labelKey)}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
            </div>

            {/* Glass Background toggle */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>{t("settings.appearance.glassBackground")}</p>
                <p className={ROW_DESC}>
                  {t("settings.appearance.glassBackgroundDesc")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Hint label={t("settings.appearance.resetDefault")}>
                  <button
                    className={RESET_ICON}
                  onClick={() =>
                    updateConfig({
                      glassEffect: defaults.glassEffect,
                      glassIntensity: defaults.glassIntensity,
                    })
                  }
                >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
                <Switch
                  checked={config.glassEffect}
                  onCheckedChange={(v) => updateConfig({ glassEffect: v })}
                />
              </div>
            </div>

            {/* Glass Intensity — 5-tier buttons */}
            <div
              className={cn(
                "py-2.5 transition-opacity duration-200",
                !glassEffect && "opacity-40 pointer-events-none",
              )}
            >
              <div className="flex items-center justify-between group">
                <div>
                  <p className={ROW_LABEL}>{t("settings.appearance.glassIntensity")}</p>
                  <p className={ROW_DESC}>
                    Tier {config.glassIntensity} ·{" "}
                    {GLASS_TIER_LABELS[config.glassIntensity as GlassTier]}
                  </p>
                </div>
                <div className="flex items-start gap-1.5 shrink-0">
                  <Hint label={t("settings.appearance.resetDefault")}>
                    <button
                      className={RESET_ICON}
                    onClick={() => updateConfig({ glassIntensity: defaults.glassIntensity })}
                  >
                      <RotateCcwIcon className="size-3" />
                    </button>
                  </Hint>
                  <div>
                    <div className="flex gap-1">
                      {([1, 2, 3, 4, 5] as GlassTier[]).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          disabled={!glassEffect}
                          onClick={() => updateConfig({ glassIntensity: tier })}
                          className={cn(
                            "h-8 w-8 rounded-md text-xs font-medium transition-all",
                            config.glassIntensity === tier
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : glassEffect
                                ? "bg-muted hover:bg-muted/80 text-muted-foreground"
                                : "bg-muted/50 text-muted-foreground/50 cursor-not-allowed",
                          )}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[length:var(--font-size-10)] text-muted-foreground mt-0.5">
                      <span>Minimal</span>
                      <span>Max</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
