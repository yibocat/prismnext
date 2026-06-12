// components/modules/settings/appearance-settings.tsx
// Card-based layout matching Shortcuts settings — categorized, consistent rows, no <hr> dividers.
// Each setting row has a hover-visible reset-to-default button next to its control (right side).

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, Decoration } from "@codemirror/view";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import { RotateCcwIcon } from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import { getDefaultThemeConfig } from "@/lib/theme/theme-generator";
import { GLASS_TIER_LABELS, type GlassTier } from "@/lib/theme/glass-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { EditorThemePicker } from "./editor-theme-picker";
import { PRIMARY_COLORS } from "@/lib/theme/primary-colors";
import { SANS_FONTS, MONO_FONTS } from "@/lib/theme/font-options";

const RADIUS_LEVELS = [
  { value: "0", label: "Sharp" },
  { value: "0.375", label: "Small" },
  { value: "0.525", label: "Medium" },
  { value: "0.775", label: "Large" },
  { value: "0.975", label: "Full" },
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

// ── Shared tokens ──
const TRIGGER = "!h-6 !px-2 !py-0 !text-[length:var(--font-size-11)] bg-background [&_svg]:!size-3";
const STEPPER = "inline-flex items-center border border-input bg-background rounded-md h-6";
const STEPPER_BTN = "rounded-none h-full hover:bg-transparent [&_svg]:size-3";
const MENU = "!p-0.5";
const MENU_ITEM = "!py-1 !text-[length:var(--font-size-11)]";

const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const RESET_ICON =
  "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const config = useThemeStore((s) => s.config);
  const updateConfig = useThemeStore((s) => s.updateConfig);
  const glassEffect = config.glassEffect;
  const defaults = getDefaultThemeConfig();

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
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Appearance</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Customize the look and feel of PrismNext.
          </p>
        </div>

        {/* ── Color ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Theme</h3>
          <div className={CARD}>
            {/* Theme Mode */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>Theme Mode</p>
                <p className={ROW_DESC}>Dark, light, or follow system.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() => setTheme("system")}
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
                <Select value={theme} onValueChange={(v) => setTheme(v)}>
                  <SelectTrigger className={cn("w-24", TRIGGER)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={MENU}>
                    <SelectItem className={MENU_ITEM} value="dark">Dark</SelectItem>
                    <SelectItem className={MENU_ITEM} value="light">Light</SelectItem>
                    <SelectItem className={MENU_ITEM} value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Theme Color */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>Theme Color</p>
                <p className={ROW_DESC}>Color family for buttons, links, and accents.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() => updateConfig({ primaryColor: defaults.primaryColor })}
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
                <Select value={config.primaryColor} onValueChange={(v) => updateConfig({ primaryColor: v })}>
                  <SelectTrigger className={cn("w-32", TRIGGER)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={MENU}>
                    {PRIMARY_COLORS.map((p) => (
                      <SelectItem className={MENU_ITEM} key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-3 rounded-full"
                            style={{ backgroundColor: p.primaryLight }}
                          />
                          {p.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Base Intensity */}
            <div className="py-2.5 group">
              <div className="flex items-center justify-between">
                <div>
                  <p className={ROW_LABEL}>Base Intensity</p>
                  <p className={ROW_DESC}>How much the theme color infuses the background.</p>
                </div>
                <div className="flex items-start gap-1.5 shrink-0">
                  <button
                    className={RESET_ICON}
                    onClick={() => updateConfig({ baseIntensity: defaults.baseIntensity })}
                    title="Reset to default"
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Slider
                        value={[config.baseIntensity * 100]}
                        min={0}
                        max={100}
                        step={5}
                        className="w-36 [&>span:first-child]:!h-[3px]"
                        onValueChange={([v]: number[]) => {
                          if (v !== undefined) updateConfig({ baseIntensity: v / 100 });
                        }}
                      />
                      <span className="text-[length:var(--font-size-12)] text-muted-foreground tabular-nums w-8 text-right">
                        {Math.round(config.baseIntensity * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[length:var(--font-size-10)] text-muted-foreground/50 mt-0.5">
                      <span>Clean</span>
                      <span>Deep</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Typography ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Typography</h3>
          <div className={CARD}>
            {/* UI Font */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>UI Font</p>
                <p className={ROW_DESC}>Interface typeface and size.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() =>
                    updateConfig({ fontSans: defaults.fontSans, uiFontSize: defaults.uiFontSize })
                  }
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
                <div className="flex gap-2">
                  <Select value={config.fontSans} onValueChange={(v) => updateConfig({ fontSans: v })}>
                    <SelectTrigger className={cn("w-28", TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={MENU}>
                      {SANS_FONTS.map((f) => (
                        <SelectItem className={MENU_ITEM} key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

            {/* Editor Font */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>Editor Font</p>
                <p className={ROW_DESC}>Code editor typeface and size.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() =>
                    updateConfig({
                      editorFontFamily: defaults.editorFontFamily,
                      editorFontSize: defaults.editorFontSize,
                    })
                  }
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
                <div className="flex gap-2">
                  <Select
                    value={config.editorFontFamily}
                    onValueChange={(v) => updateConfig({ editorFontFamily: v })}
                  >
                    <SelectTrigger className={cn("w-36", TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={MENU}>
                      {MONO_FONTS.map((f) => (
                        <SelectItem className={MENU_ITEM} key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
          <h3 className={CATEGORY_HEADER}>Surface</h3>
          <div className={CARD}>
            {/* Border Radius */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>Border Radius</p>
                <p className={ROW_DESC}>Corner roundness for all components.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() => updateConfig({ radius: defaults.radius })}
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
                <Select
                  value={config.radius.toString()}
                  onValueChange={(v) => updateConfig({ radius: parseFloat(v) })}
                >
                  <SelectTrigger className={cn("w-28", TRIGGER)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={MENU}>
                    {RADIUS_LEVELS.map((l) => (
                      <SelectItem className={MENU_ITEM} key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Glass Background toggle */}
            <div className="flex items-center justify-between py-2.5 group">
              <div>
                <p className={ROW_LABEL}>Glass Background</p>
                <p className={ROW_DESC}>
                  Frosted glass window effect. Sidebar becomes more transparent as intensity
                  increases.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className={RESET_ICON}
                  onClick={() =>
                    updateConfig({
                      glassEffect: defaults.glassEffect,
                      glassIntensity: defaults.glassIntensity,
                    })
                  }
                  title="Reset to default"
                >
                  <RotateCcwIcon className="size-3" />
                </button>
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
                  <p className={ROW_LABEL}>Glass Intensity</p>
                  <p className={ROW_DESC}>
                    Tier {config.glassIntensity} ·{" "}
                    {GLASS_TIER_LABELS[config.glassIntensity as GlassTier]}
                  </p>
                </div>
                <div className="flex items-start gap-1.5 shrink-0">
                  <button
                    className={RESET_ICON}
                    onClick={() => updateConfig({ glassIntensity: defaults.glassIntensity })}
                    title="Reset to default"
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
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
