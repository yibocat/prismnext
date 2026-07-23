# Theme Pack 色系主题系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ Shipping Deviation (2026-07-23)**
>
> **Task 3 (Intensity derive, Clean/Balanced/Deep) 在实现阶段被砍掉。** 最终 shipped 范围 = 每包单一手写 palette（路径 1），无 intensity 维度，无 `deriveIntensity()` 工具，无 `theme-intensity-derive.test.ts`。
>
> 砍掉原因：手写 5 包 × 2 模式锚点已经覆盖 5 角色 + semantic + chart；强度档位带来的「同包浓淡变化」并不是用户的主要诉求，反而增加了外观选择维度的认知负担。Phase 2 评估是否补回。
>
> 下文 Task 3 仍保留作为「如果未来要补 intensity 派生的参考实现」，但代码与测试未落地。本 plan 任务追踪以 checkbox 为准，Task 3 全程 `[ ]` 即可。

**Goal:** Replace single-hue + continuous intensity theming with five curated multi-role theme packs, while keeping existing shadcn CSS variable names. ~~Clean/Balanced/Deep intensity~~ (shipped 砍掉 — 改为每包单手写 palette).

**Architecture:** Hand-author `balanced` light/dark `ThemeAnchors` per pack (single palette, no derivation); map anchors → CSS vars in `generateThemeCSS`; inject via existing `#prism-theme` theme-store. Appearance selects `themePack` only.

**Tech Stack:** TypeScript, Zustand theme-store, OKLCH CSS variables, Vitest, existing Appearance settings + i18n

**Spec:** `docs/superpowers/specs/2026-07-23-theme-pack-system-design.md` (按 shipped 范围重写)

## Global Constraints

- User chooses **theme packs only** — no per-role color pickers, no “advanced” panel.
- Intensity is **exactly** `"clean" | "balanced" | "deep"` — no 0–100% slider.
- Each pack has five roles: Brand / Secondary / Accent / Neutral / Semantic.
- Intensity mainly adjusts Neutral; Brand/Secondary/Accent/Semantic get **slight** tweaks only.
- Keep outputting existing shadcn CSS var names (`--primary`, `--accent`, …). Do not mass-edit component classes.
- Default: `themePack: "academic"`, `intensity: "balanced"`.
- Phase 1 only (color system + Appearance + migration). No broad UI/UX restyle.
- Domain home: `src/renderer/lib/theme/`. New files only for `theme-packs`, `intensity-derive`, `oklch`, `theme-migrate` (clear boundaries).
- Changelog under next Unreleased in `changelog/0.6.x.md` (package is `0.6.1` → `## 0.6.2 (Unreleased)`).
- Prefer TDD for pure functions (oklch, derive, migrate, generator CSS assertions).

---

## File map (create / modify / retire)

| Path | Role |
|------|------|
| `src/renderer/lib/theme/oklch.ts` | Parse/format OKLCH; clamp helpers |
| `src/renderer/lib/theme/theme-packs.ts` | Types, 5 packs, `getThemePack`, registry |
| `src/renderer/lib/theme/intensity-derive.ts` | `deriveIntensity(anchors, intensity, opts?)` |
| `src/renderer/lib/theme/theme-migrate.ts` | Legacy → new `ThemeConfig` |
| `src/renderer/lib/theme/theme-generator.ts` | New config shape; pack→CSS; inject semantic vars |
| `src/renderer/stores/theme-store.ts` | Load/save via migrate |
| `src/renderer/components/modules/settings/appearance-settings.tsx` | Pack select + 3-tier intensity |
| `src/renderer/lib/i18n/locales/{en,zh-CN,zh-HK}.json` | Copy |
| `src/renderer/lib/theme/primary-colors.ts` | Delete after migration helpers live elsewhere |
| `src/renderer/lib/theme/color-palettes.ts` | Delete or gut — no runtime `generateNeutralVars` |
| `tests/renderer/theme-oklch.test.ts` | OKLCH utils |
| `tests/renderer/theme-intensity-derive.test.ts` | Clean/Deep deltas + graphite |
| `tests/renderer/theme-migrate.test.ts` | Legacy maps |
| `tests/renderer/theme-generator.test.ts` | CSS contains distinct accent/semantic |
| `changelog/0.6.x.md` | Unreleased notes |
| `docs/superpowers/specs/2026-07-23-theme-pack-system-design.md` | Already Approved |

---

### Task 1: OKLCH helpers

**Files:**
- Create: `src/renderer/lib/theme/oklch.ts`
- Test: `tests/renderer/theme-oklch.test.ts`

**Interfaces:**
- Produces:
  - `interface Oklch { l: number; c: number; h: number; alpha?: number }`
  - `parseOklch(input: string): Oklch | null`
  - `formatOklch(c: Oklch): string`
  - `clamp01(n: number): number`
  - `clampChroma(c: number): number` — clamp to `[0, 0.4]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseOklch, formatOklch, clampChroma } from "@/lib/theme/oklch";

describe("oklch", () => {
  it("parses oklch with optional alpha", () => {
    expect(parseOklch("oklch(0.55 0.18 250)")).toEqual({
      l: 0.55,
      c: 0.18,
      h: 250,
    });
    expect(parseOklch("oklch(1 0 0 / 18%)")).toEqual({
      l: 1,
      c: 0,
      h: 0,
      alpha: 0.18,
    });
  });

  it("round-trips format", () => {
    const s = formatOklch({ l: 0.55, c: 0.18, h: 250 });
    expect(s).toBe("oklch(0.550 0.1800 250)");
    expect(parseOklch(s)).toMatchObject({ l: 0.55, c: 0.18, h: 250 });
  });

  it("formats alpha as percent", () => {
    expect(formatOklch({ l: 1, c: 0, h: 0, alpha: 0.18 })).toBe(
      "oklch(1.000 0.0000 0 / 18%)",
    );
  });

  it("clamps chroma", () => {
    expect(clampChroma(-0.1)).toBe(0);
    expect(clampChroma(0.5)).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/renderer/theme-oklch.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `oklch.ts`**

```ts
export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha?: number;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function clampChroma(c: number): number {
  return Math.min(0.4, Math.max(0, c));
}

export function parseOklch(input: string): Oklch | null {
  const m = input.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?\s*)?\)/i,
  );
  if (!m) return null;
  const l = parseFloat(m[1]);
  const c = parseFloat(m[2]);
  const h = parseFloat(m[3]);
  let alpha: number | undefined;
  if (m[4] !== undefined) {
    const raw = parseFloat(m[4]);
    // "18%" → 18 in capture if % included in group; handle both 0.18 and 18
    alpha = raw > 1 ? raw / 100 : raw;
  }
  return { l, c, h, ...(alpha !== undefined ? { alpha } : {}) };
}

export function formatOklch({ l, c, h, alpha }: Oklch): string {
  const base = `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h}`;
  if (alpha === undefined) return `${base})`;
  const pct = Math.round(clamp01(alpha) * 100);
  return `${base} / ${pct}%)`;
}
```

Adjust the alpha regex if needed so `"oklch(1 0 0 / 18%)"` parses to `alpha: 0.18`. Prefer capturing the percent digits: `\/\s*([\d.]+)%`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run tests/renderer/theme-oklch.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/oklch.ts tests/renderer/theme-oklch.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): add OKLCH parse/format helpers for theme packs

EOF
)"
```

---

### Task 2: Theme pack types + Academic Balanced anchors

**Files:**
- Create: `src/renderer/lib/theme/theme-packs.ts` (types + academic only first; other packs stubbed throwing or incomplete — prefer types + `ACADEMIC_PACK` export, registry filled in Task 4)
- Test: `tests/renderer/theme-packs.test.ts`

**Interfaces:**
- Produces types + `getThemePack(id)`, `THEME_PACK_IDS`, `ThemePack`, `ThemeAnchors`, `ThemePackId`, `ThemeIntensity`
- Consumes: none beyond string oklch literals

- [ ] **Step 1: Write failing registry test**

```ts
import { describe, expect, it } from "vitest";
import { THEME_PACK_IDS, getThemePack } from "@/lib/theme/theme-packs";

describe("theme-packs", () => {
  it("lists five pack ids", () => {
    expect(THEME_PACK_IDS).toEqual([
      "academic",
      "midnight",
      "forest",
      "warm-paper",
      "graphite",
    ]);
  });

  it("academic balanced accent differs from muted", () => {
    const pack = getThemePack("academic");
    expect(pack.balanced.light.accent.base).not.toBe(
      pack.balanced.light.neutral.muted,
    );
    expect(pack.balanced.light.brand.base).toMatch(/^oklch\(/);
    expect(pack.swatches.light).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/renderer/theme-packs.test.ts`

- [ ] **Step 3: Implement types + Academic pack (other packs can temporarily clone academic with different ids/labels — Task 4 replaces them)**

Put this structure in `theme-packs.ts`:

```ts
export type ThemePackId =
  | "academic"
  | "midnight"
  | "forest"
  | "warm-paper"
  | "graphite";

export type ThemeIntensity = "clean" | "balanced" | "deep";

export const THEME_PACK_IDS: ThemePackId[] = [
  "academic",
  "midnight",
  "forest",
  "warm-paper",
  "graphite",
];

export interface ThemeAnchors {
  brand: { base: string; foreground: string; ring: string };
  secondary: { base: string; foreground: string };
  accent: { base: string; foreground: string };
  neutral: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    input: string;
    sidebar: string;
    sidebarForeground: string;
    sidebarAccent: string;
    sidebarAccentForeground: string;
    sidebarBorder: string;
    sidebarRing: string;
  };
  semantic: {
    destructive: string;
    destructiveForeground: string;
    success: string;
    successForeground: string;
    warning: string;
    warningForeground: string;
  };
}

export interface ThemePack {
  id: ThemePackId;
  labelKey: string;
  descriptionKey: string;
  swatches: { light: string[]; dark: string[] };
  defaultChartScheme: "default" | "vivid" | "pastel" | "monochrome";
  balanced: { light: ThemeAnchors; dark: ThemeAnchors };
  intensityOverrides?: Partial<
    Record<"clean" | "deep", { light?: Partial<ThemeAnchors>; dark?: Partial<ThemeAnchors> }>
  >;
}

/** Academic — calibration pack (cool academic blue family) */
export const ACADEMIC_PACK: ThemePack = {
  id: "academic",
  labelKey: "settings.appearance.packs.academic",
  descriptionKey: "settings.appearance.packs.academicDesc",
  defaultChartScheme: "default",
  swatches: {
    light: [
      "oklch(0.55 0.18 250)",
      "oklch(0.94 0.02 230)",
      "oklch(0.93 0.045 195)",
      "oklch(0.99 0.008 250)",
      "oklch(0.55 0.20 25)",
    ],
    dark: [
      "oklch(0.68 0.16 250)",
      "oklch(0.28 0.03 240)",
      "oklch(0.30 0.05 195)",
      "oklch(0.18 0.02 250)",
      "oklch(0.65 0.18 25)",
    ],
  },
  balanced: {
    light: {
      brand: {
        base: "oklch(0.55 0.18 250)",
        foreground: "oklch(0.985 0 0)",
        ring: "oklch(0.55 0.22 250)",
      },
      secondary: {
        base: "oklch(0.94 0.02 230)",
        foreground: "oklch(0.28 0.03 250)",
      },
      accent: {
        base: "oklch(0.93 0.045 195)",
        foreground: "oklch(0.28 0.04 210)",
      },
      neutral: {
        background: "oklch(0.99 0.008 250)",
        foreground: "oklch(0.18 0.02 250)",
        card: "oklch(0.995 0.006 250)",
        cardForeground: "oklch(0.18 0.02 250)",
        popover: "oklch(0.995 0.006 250)",
        popoverForeground: "oklch(0.18 0.02 250)",
        muted: "oklch(0.96 0.012 245)",
        mutedForeground: "oklch(0.50 0.02 250)",
        border: "oklch(0.88 0.02 250)",
        input: "oklch(0.88 0.02 250)",
        sidebar: "oklch(0.97 0.014 248)",
        sidebarForeground: "oklch(0.18 0.02 250)",
        sidebarAccent: "oklch(0.93 0.04 195)",
        sidebarAccentForeground: "oklch(0.22 0.03 220)",
        sidebarBorder: "oklch(0.88 0.02 250)",
        sidebarRing: "oklch(0.55 0.22 250)",
      },
      semantic: {
        destructive: "oklch(0.55 0.20 25)",
        destructiveForeground: "oklch(0.985 0 0)",
        success: "oklch(0.55 0.14 155)",
        successForeground: "oklch(0.985 0 0)",
        warning: "oklch(0.70 0.14 85)",
        warningForeground: "oklch(0.22 0.02 85)",
      },
    },
    dark: {
      brand: {
        base: "oklch(0.68 0.16 250)",
        foreground: "oklch(0.16 0.02 250)",
        ring: "oklch(0.68 0.20 250)",
      },
      secondary: {
        base: "oklch(0.28 0.03 240)",
        foreground: "oklch(0.92 0.02 250)",
      },
      accent: {
        base: "oklch(0.30 0.05 195)",
        foreground: "oklch(0.92 0.02 200)",
      },
      neutral: {
        background: "oklch(0.18 0.02 250)",
        foreground: "oklch(0.97 0.01 250)",
        card: "oklch(0.22 0.025 250)",
        cardForeground: "oklch(0.97 0.01 250)",
        popover: "oklch(0.22 0.025 250)",
        popoverForeground: "oklch(0.97 0.01 250)",
        muted: "oklch(0.26 0.03 245)",
        mutedForeground: "oklch(0.72 0.02 250)",
        border: "oklch(0.35 0.03 250 / 55%)",
        input: "oklch(0.35 0.03 250 / 60%)",
        sidebar: "oklch(0.20 0.025 250)",
        sidebarForeground: "oklch(0.97 0.01 250)",
        sidebarAccent: "oklch(0.30 0.05 195)",
        sidebarAccentForeground: "oklch(0.95 0.02 200)",
        sidebarBorder: "oklch(0.35 0.03 250 / 55%)",
        sidebarRing: "oklch(0.68 0.20 250)",
      },
      semantic: {
        destructive: "oklch(0.65 0.18 25)",
        destructiveForeground: "oklch(0.15 0.02 25)",
        success: "oklch(0.68 0.14 155)",
        successForeground: "oklch(0.15 0.02 155)",
        warning: "oklch(0.75 0.12 85)",
        warningForeground: "oklch(0.18 0.02 85)",
      },
    },
  },
};
```

For this task, registry may only include academic if tests are adjusted — **prefer** registering all five ids with academic clone placeholders labeled correctly so Task 1 registry test passes; Task 4 overwrites personalities.

```ts
const PLACEHOLDER = (id: ThemePackId, labelKey: string, descriptionKey: string): ThemePack => ({
  ...ACADEMIC_PACK,
  id,
  labelKey,
  descriptionKey,
});

export const THEME_PACKS: Record<ThemePackId, ThemePack> = {
  academic: ACADEMIC_PACK,
  midnight: PLACEHOLDER("midnight", "settings.appearance.packs.midnight", "settings.appearance.packs.midnightDesc"),
  forest: PLACEHOLDER("forest", "settings.appearance.packs.forest", "settings.appearance.packs.forestDesc"),
  "warm-paper": PLACEHOLDER("warm-paper", "settings.appearance.packs.warmPaper", "settings.appearance.packs.warmPaperDesc"),
  graphite: PLACEHOLDER("graphite", "settings.appearance.packs.graphite", "settings.appearance.packs.graphiteDesc"),
};

export function getThemePack(id: ThemePackId): ThemePack {
  return THEME_PACKS[id] ?? THEME_PACKS.academic;
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `pnpm exec vitest run tests/renderer/theme-packs.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/theme-packs.ts tests/renderer/theme-packs.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): add theme pack types and Academic balanced anchors

EOF
)"
```

---

### Task 3: Intensity derive (Clean / Deep) — **CUT, NOT SHIPPED**

**Files:**
- Create: `src/renderer/lib/theme/intensity-derive.ts`
- Test: `tests/renderer/theme-intensity-derive.test.ts`

**Interfaces:**
- Consumes: `ThemeAnchors`, `ThemeIntensity` from `theme-packs.ts`; `parseOklch` / `formatOklch` / `clampChroma` / `clamp01` from `oklch.ts`
- Produces: `deriveIntensity(anchors: ThemeAnchors, intensity: ThemeIntensity, options?: { packId?: ThemePackId; overrides?: ThemePack["intensityOverrides"] }): ThemeAnchors`

**Locked Δ tables (calibration — tune only if manual QA fails):**

| Mode | Role group | Clean | Deep |
|------|------------|-------|------|
| light | neutral surfaces (`background`,`card`,`popover`,`muted`,`border`,`input`,`sidebar*`) | `c *= 0.45` | `c *= 1.55` |
| light | brand / secondary / accent `base`+`ring` | `c *= 0.92` | `c *= 1.08` |
| light | semantic bases | `c *= 0.96` | `c *= 1.05` |
| dark | neutral surfaces | `c *= 0.50` | `c *= 1.45` |
| dark | brand / secondary / accent | `c *= 0.94` | `c *= 1.06` |
| dark | semantic | `c *= 0.97` | `c *= 1.04` |

- Foregrounds (`*Foreground`, `foreground`, `mutedForeground`): **do not** scale chroma; optionally nudge `l` by ±0.01 toward higher contrast on Deep / lower on Clean (max ±0.015).
- `balanced`: return deep clone of anchors unchanged.
- `packId === "graphite"`: for neutral surfaces force `c = 0` after transform; Deep/Clean adjust **lightness** instead (`clean`: surfaces `l += 0.02` toward white in light / toward mid in dark — implement as: light mode clean `l = clamp01(l + 0.015)`, deep `l = clamp01(l - 0.02)`; dark mode clean `l = clamp01(l + 0.02)`, deep `l = clamp01(l - 0.025)`).
- After transform, for pairs `(foreground, background)` and `(mutedForeground, background)`: if relative luminance contrast is obviously broken, nudge foreground `l` (simple heuristic OK: light mode ensure `fg.l < bg.l - 0.35` for main fg; dark mode `fg.l > bg.l + 0.45`). Keep heuristic simple; document in code comment.
- Apply `overrides?.[intensity]` shallow-merge on top of derived anchors (merge top-level role objects).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { ACADEMIC_PACK } from "@/lib/theme/theme-packs";
import { deriveIntensity } from "@/lib/theme/intensity-derive";
import { parseOklch } from "@/lib/theme/oklch";

describe("deriveIntensity", () => {
  const base = ACADEMIC_PACK.balanced.light;

  it("balanced is identity", () => {
    const out = deriveIntensity(base, "balanced");
    expect(out.brand.base).toBe(base.brand.base);
    expect(out.accent.base).toBe(base.accent.base);
  });

  it("clean reduces neutral chroma", () => {
    const out = deriveIntensity(base, "clean");
    const before = parseOklch(base.neutral.background)!.c;
    const after = parseOklch(out.neutral.background)!.c;
    expect(after).toBeLessThan(before);
  });

  it("deep increases neutral chroma more than brand", () => {
    const out = deriveIntensity(base, "deep");
    const n0 = parseOklch(base.neutral.muted)!.c;
    const n1 = parseOklch(out.neutral.muted)!.c;
    const b0 = parseOklch(base.brand.base)!.c;
    const b1 = parseOklch(out.brand.base)!.c;
    expect(n1 / n0).toBeGreaterThan(b1 / b0);
  });

  it("graphite keeps neutral chroma near zero", () => {
    // Build minimal graphite-like anchors: copy academic but zero neutral C
    // (full graphite pack lands in Task 4; here pass packId graphite with zeroed fixture)
    const g = structuredClone(base);
    // zeroing not required if derive forces c=0 for graphite neutrals
    const out = deriveIntensity(g, "deep", { packId: "graphite" });
    expect(parseOklch(out.neutral.background)!.c).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm exec vitest run tests/renderer/theme-intensity-derive.test.ts`

- [ ] **Step 3: Implement `intensity-derive.ts`** following the Δ table above. Walk all string fields in anchors; classify by path (`neutral.*` vs `brand.*` vs `semantic.*` vs foreground keys). Use recursive walk or explicit field lists — explicit lists preferred for clarity.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/intensity-derive.ts tests/renderer/theme-intensity-derive.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): derive Clean/Deep intensity from Balanced anchors

EOF
)"
```

---

### Task 4: Author remaining four theme packs

**Files:**
- Modify: `src/renderer/lib/theme/theme-packs.ts`
- Modify: `tests/renderer/theme-packs.test.ts` — assert each pack’s brand hue family differs

**Interfaces:**
- Produces: real `THEME_PACKS` for all five ids (no academic clones)

**Personality seeds (implement full `ThemeAnchors` for light+dark each):**

| Pack | Brand H | Accent H | Neutral H | Notes |
|------|---------|----------|-----------|-------|
| midnight | ~275 | ~190 | ~265 | darker cards; electric accent |
| forest | ~155 | ~95 | ~145 | warm-green neutrals |
| warm-paper | ~35 | ~75 | ~70 | paper bg ~`oklch(0.98 0.015 75)` light |
| graphite | brand near gray `c≈0.01` | gray accent | **all neutral `c=0`** | `defaultChartScheme: "monochrome"` |

- [ ] **Step 1: Extend test**

```ts
  it("packs use distinct brand hues", () => {
    const hues = THEME_PACK_IDS.map((id) => {
      const b = getThemePack(id).balanced.light.brand.base;
      return parseOklch(b)!.h;
    });
    // graphite may be ~0; others should not all equal academic 250
    expect(new Set(hues.map((h) => Math.round(h / 10))).size).toBeGreaterThanOrEqual(4);
  });

  it("graphite neutrals are chroma-free", () => {
    const n = getThemePack("graphite").balanced.light.neutral;
    for (const key of ["background", "muted", "card"] as const) {
      expect(parseOklch(n[key])!.c).toBe(0);
    }
  });
```

- [ ] **Step 2: Run — FAIL** (placeholders still academic hues)

- [ ] **Step 3: Replace midnight / forest / warm-paper / graphite with full authored packs**

Follow Academic’s field completeness. Keep semantic hues recognizable (destructive ~20–30, success ~145–155, warning ~75–90) but shift L/C slightly to match pack warmth.

Suggested midnight light brand: `oklch(0.50 0.18 275)`; forest: `oklch(0.48 0.14 155)`; warm-paper: `oklch(0.52 0.14 35)`; graphite brand light: `oklch(0.30 0.01 0)` / dark: `oklch(0.82 0.01 0)`.

- [ ] **Step 4: Run theme-packs + intensity-derive tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/theme-packs.ts tests/renderer/theme-packs.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): author Midnight, Forest, Warm Paper, and Graphite packs

EOF
)"
```

---

### Task 5: Theme generator — pack → CSS

**Files:**
- Modify: `src/renderer/lib/theme/theme-generator.ts`
- Test: `tests/renderer/theme-generator.test.ts`

**Interfaces:**
- Consumes: `getThemePack`, `deriveIntensity`, `ChartSchemeId` / `CHART_PALETTES`, fonts, glass
- Produces updated:
  - `ThemeConfig` with `themePack` + `intensity` (remove `primaryColor` / `baseIntensity`)
  - `getDefaultThemeConfig(): ThemeConfig`
  - `generateThemeCSS(config: ThemeConfig): string`
  - `mapAnchorsToCssVars(anchors: ThemeAnchors): Record<string, string>` (export for tests)

**`ThemeConfig` shape:**

```ts
import type { ThemePackId, ThemeIntensity } from "./theme-packs";

export interface ThemeConfig {
  themePack: ThemePackId;
  intensity: ThemeIntensity;
  radius: number;
  fontSans: string;
  fontMono: string;
  uiFontSize: string;
  editorFontFamily: string;
  editorFontSize: string;
  chartScheme?: ChartSchemeId; // ignored for color source if pack.defaultChartScheme used
  glassEffect: boolean;
  glassIntensity: GlassTier;
}

export function getDefaultThemeConfig(): ThemeConfig {
  return {
    themePack: "academic",
    intensity: "balanced",
    radius: 0.525,
    fontSans: "system-ui",
    fontMono: "system-mono",
    uiFontSize: "16px",
    editorFontFamily: "system-mono",
    editorFontSize: "13px",
    glassEffect: false,
    glassIntensity: 3 as GlassTier,
  };
}
```

**Mapping rules:**

| Anchor | CSS vars |
|--------|----------|
| brand.base/foreground/ring | `--primary`, `--primary-foreground`, `--ring` |
| secondary.* | `--secondary`, `--secondary-foreground` |
| accent.* | `--accent`, `--accent-foreground` |
| neutral.* | matching `--background`, `--foreground`, `--card`, … and sidebar shell vars |
| semantic.* | `--destructive`, `--destructive-foreground`, `--success`, `--success-foreground`, `--warning`, `--warning-foreground` |
| sidebar primary | `--sidebar-primary: var(--primary)` (or brand.base duplicated) |

Also emit chart colors from `pack.defaultChartScheme` (prefer pack over `config.chartScheme` when both exist — **decision: pack wins**).

Editor syntax: keep current approach; use brand.base for keyword/tag/cursor/selection.

Remove imports of `PRIMARY_COLORS` / `generateNeutralVars`.

- [ ] **Step 1: Write failing generator test**

```ts
import { describe, expect, it } from "vitest";
import { generateThemeCSS, getDefaultThemeConfig } from "@/lib/theme/theme-generator";

describe("generateThemeCSS", () => {
  it("emits semantic and distinct accent for academic", () => {
    const css = generateThemeCSS(getDefaultThemeConfig());
    expect(css).toContain("--destructive:");
    expect(css).toContain("--success:");
    expect(css).toContain("--warning:");
    // accent should appear and not equal muted in the :root block
    const root = css.split(".dark")[0];
    const accent = root.match(/--accent:\s*([^;]+);/)?.[1]?.trim();
    const muted = root.match(/--muted:\s*([^;]+);/)?.[1]?.trim();
    expect(accent).toBeTruthy();
    expect(muted).toBeTruthy();
    expect(accent).not.toBe(muted);
  });

  it("defaults to academic balanced", () => {
    const d = getDefaultThemeConfig();
    expect(d.themePack).toBe("academic");
    expect(d.intensity).toBe("balanced");
  });
});
```

- [ ] **Step 2: Run — FAIL** (old config still has primaryColor)

- [ ] **Step 3: Rewrite generator** as specified. Keep glass / font / radius / editor blocks.

- [ ] **Step 4: Run generator + packs + derive tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/theme-generator.ts tests/renderer/theme-generator.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): generate CSS from theme packs and intensity

EOF
)"
```

---

### Task 6: Migration helper

**Files:**
- Create: `src/renderer/lib/theme/theme-migrate.ts`
- Test: `tests/renderer/theme-migrate.test.ts`

**Interfaces:**
- Consumes: `getDefaultThemeConfig`, `ThemeConfig`, `ThemePackId`, `ThemeIntensity`
- Produces:
  - `migrateToThemePackConfig(raw: Record<string, unknown>): ThemeConfig`
  - Handles: already-new shape; legacy `_themeConfig` with `primaryColor`/`baseIntensity`; bare `themeColor` legacy string

**Maps (from spec):**

```ts
const PRIMARY_TO_PACK: Record<string, ThemePackId> = {
  blue: "academic",
  teal: "academic",
  violet: "midnight",
  green: "forest",
  amber: "warm-paper",
  rose: "warm-paper",
  mono: "graphite",
  "academic-blue": "academic",
  "ink-green": "forest",
};

function intensityFromLegacy(n: unknown): ThemeIntensity {
  const v = typeof n === "number" ? n : 0.35;
  if (v < 0.25) return "clean";
  if (v >= 0.55) return "deep";
  return "balanced";
}
```

If `raw.themePack` is a valid id, keep it. Strip unknown fields. Merge with defaults for fonts/radius/glass.

- [ ] **Step 1: Write tests covering blue→academic, mono→graphite, intensity bands, passthrough new shape**

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `theme-migrate.ts`**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/theme/theme-migrate.ts tests/renderer/theme-migrate.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): migrate legacy primaryColor intensity to theme packs

EOF
)"
```

---

### Task 7: Wire theme-store

**Files:**
- Modify: `src/renderer/stores/theme-store.ts`

**Interfaces:**
- Consumes: `migrateToThemePackConfig`, `generateThemeCSS`, `getDefaultThemeConfig`
- On `loadConfig`: read settings; if `_themeConfig` or legacy keys present, `migrateToThemePackConfig`; regenerate; if migration changed shape, `settingsSet({ _themeConfig: migrated, _themePackMigrated: true })`
- `saveConfig` / `updateConfig` unchanged pattern but new fields

- [ ] **Step 1: Update `loadConfig` to use migrate** (no DOM test required; keep logic thin)

Replace primaryColor migration block with:

```ts
const raw = await window.electronAPI.settingsGet();
const migrated = migrateToThemePackConfig({
  ...(raw as Record<string, unknown>),
  ...(((raw as any)._themeConfig as object) ?? {}),
  themeColor: (raw as any).themeColor,
});
get()._regenerate(migrated);
const needsPersist =
  !(raw as any)._themePackMigrated ||
  (raw as any)._themeConfig?.primaryColor !== undefined ||
  (raw as any)._themeConfig?.baseIntensity !== undefined;
if (needsPersist) {
  await window.electronAPI.settingsSet({
    _themeConfig: migrated,
    _themePackMigrated: true,
  });
}
```

Refine `needsPersist` carefully so we don’t rewrite on every launch after migration — prefer:

```ts
if (!(raw as any)._themePackMigrated) {
  await window.electronAPI.settingsSet({
    _themeConfig: migrated,
    _themePackMigrated: true,
  });
}
```

And always `_regenerate(migrated)` when `_themeConfig` exists OR always migrate in-memory even if already flagged (migrate must be idempotent on new shape).

- [ ] **Step 2: Typecheck store consumers**

Run: `pnpm exec tsc --noEmit`  
Fix any `primaryColor` / `baseIntensity` references that break (Appearance is Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stores/theme-store.ts
git commit -m "$(cat <<'EOF'
feat(theme): load and persist theme pack config via migration

EOF
)"
```

---

### Task 8: Appearance UI + i18n

**Files:**
- Modify: `src/renderer/components/modules/settings/appearance-settings.tsx`
- Modify: `src/renderer/lib/i18n/locales/en.json`
- Modify: `src/renderer/lib/i18n/locales/zh-CN.json`
- Modify: `src/renderer/lib/i18n/locales/zh-HK.json`

**UI:**

1. Replace Theme Color select: map `THEME_PACK_IDS`, show 5 swatches + `t(pack.labelKey)`.
2. Replace Base Intensity slider with three buttons (or `AppSelect`) for `clean` / `balanced` / `deep`.
3. Reset buttons → `academic` / `balanced`.
4. Remove `PRIMARY_COLORS` import.

**i18n keys (add/replace):**

```json
"themePack": "Theme",
"themePackDesc": "A full color system for the app, not a single accent.",
"intensity": "Intensity",
"intensityDesc": "How strongly surfaces pick up the palette.",
"intensityClean": "Clean",
"intensityBalanced": "Balanced",
"intensityDeep": "Deep",
"packs": {
  "academic": "Academic",
  "academicDesc": "Cool, readable, research-ready.",
  "midnight": "Midnight",
  "midnightDesc": "Deep focus with electric accents.",
  "forest": "Forest",
  "forestDesc": "Calm greens for long reading sessions.",
  "warmPaper": "Warm Paper",
  "warmPaperDesc": "Paper-like warmth for writing.",
  "graphite": "Graphite",
  "graphiteDesc": "Minimal neutrals with quiet semantics."
}
```

Provide zh-CN / zh-HK equivalents (主题 / 强度 / 清爽 / 均衡 / 浓郁, etc.).

Keep existing `clean`/`deep` keys if reused; prefer explicit `intensityClean` to avoid clashing with old slider labels.

Swatch row example:

```tsx
<span className="flex items-center gap-2">
  <span className="flex gap-0.5">
    {pack.swatches.light.slice(0, 5).map((c, i) => (
      <span key={i} className="size-2.5 rounded-sm" style={{ backgroundColor: c }} />
    ))}
  </span>
  {t(pack.labelKey)}
</span>
```

Intensity control: three compact buttons in a row using existing `Button` `variant={config.intensity === id ? "default" : "outline"}` `size="sm"`.

- [ ] **Step 1: Update i18n files**

- [ ] **Step 2: Update AppearanceSettings**

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modules/settings/appearance-settings.tsx src/renderer/lib/i18n/locales/en.json src/renderer/lib/i18n/locales/zh-CN.json src/renderer/lib/i18n/locales/zh-HK.json
git commit -m "$(cat <<'EOF'
feat(theme): Appearance selects theme packs and intensity tiers

EOF
)"
```

---

### Task 9: Retire single-hue path + changelog

**Files:**
- Delete: `src/renderer/lib/theme/primary-colors.ts` (if no remaining imports)
- Modify or delete: `src/renderer/lib/theme/color-palettes.ts` — remove `generateNeutralVars` / `DEFAULT_INTENSITY` if unused; delete file if empty of exports
- Modify: `changelog/0.6.x.md` under `## 0.6.2 (Unreleased)`
- Grep: `primaryColor|baseIntensity|PRIMARY_COLORS|generateNeutralVars|primary-colors|DEFAULT_INTENSITY`

- [ ] **Step 1: Grep and remove dead code**

Run: `rg "primaryColor|baseIntensity|PRIMARY_COLORS|generateNeutralVars|from \\\"./primary-colors\\\"|from \\\"./color-palettes\\\"" src tests`

Fix any leftovers.

- [ ] **Step 2: Changelog bullet**

```markdown
### Appearance

- Theme packs (Academic, Midnight, Forest, Warm Paper, Graphite) replace single accent colors; intensity is Clean / Balanced / Deep
```

- [ ] **Step 3: Full test + typecheck**

Run:

```bash
pnpm exec vitest run tests/renderer/theme-oklch.test.ts tests/renderer/theme-packs.test.ts tests/renderer/theme-intensity-derive.test.ts tests/renderer/theme-migrate.test.ts tests/renderer/theme-generator.test.ts
pnpm exec tsc --noEmit
```

Expected: all PASS / no errors

- [ ] **Step 4: Commit**

```bash
git add -u src/renderer/lib/theme changelog/0.6.x.md
git commit -m "$(cat <<'EOF'
refactor(theme): remove single-hue palette path; note theme packs in changelog

EOF
)"
```

---

### Task 10: Manual QA matrix (human / agent with app)

**Files:** none (checklist)

- [ ] **Step 1: Run app** `pnpm dev`

- [ ] **Step 2: For each pack × light/dark × clean/balanced/deep, spot-check:**
  - Primary button vs background
  - Sidebar hover (accent)
  - Muted text readable
  - Destructive / success / warning if visible in UI
  - Graphite: no obvious colored wash on surfaces
  - Reset → Academic + Balanced

- [ ] **Step 3: Migrate smoke:** temporarily set old `_themeConfig: { primaryColor: "violet", baseIntensity: 0.7, ...defaults }` via settings if easy; reload → Midnight + Deep

- [ ] **Step 4: If Deep/Clean looks wrong on one pack only**, add `intensityOverrides` on that pack — do **not** rewrite global Δ table unless ≥3 packs fail the same way.

- [ ] **Step 5: Final commit only if overrides or Δ tweaks were needed**

```bash
git add src/renderer/lib/theme/theme-packs.ts src/renderer/lib/theme/intensity-derive.ts
git commit -m "$(cat <<'EOF'
fix(theme): tune intensity derive after manual QA

EOF
)"
```

---

## Spec coverage checklist

| Spec section | Task | Status |
|--------------|------|--------|
| Theme pack list (5 atmospheric) | 2, 4 | ✅ shipped |
| Five roles + CSS mapping | 5 | ✅ shipped |
| Clean/Balanced/Deep + surface-first | 3 | ❌ cut (no intensity tier) |
| Hybrid Balanced + derive | 3, 5 | ❌ cut (single palette only) |
| Config `themePack` only (no `intensity`) | 5, 7 | ✅ shipped |
| Migration maps | 6, 7 | ✅ shipped |
| Appearance + i18n | 8 | ✅ shipped |
| Retire single-hue | 9 | ✅ shipped |
| Chart pack default | 5 | ✅ shipped |
| Semantic in generated CSS | 5 | ✅ shipped |
| Tests (4 files: packs / migrate / oklch / generator) | 1, 2, 4, 5, 6, 9 | ✅ shipped |
| Changelog | 9 | ✅ shipped |
| Manual QA | 10 | ✅ shipped |
| Git status colors hybrid (added/deleted themed, modified/renamed fixed) | 9 + 12 | ✅ shipped |
| Phase 2 UI polish | Out of scope | — |

## Open details resolved in this plan

1. ~~ΔL/ΔC tables — locked in Task 3~~ — **CUT (intensity not shipped)**
2. ~~Contrast — simple L-separation heuristic in derive~~ — **CUT**
3. Appearance control — **Select for packs only (no intensity buttons)**
4. `chartScheme` — each `ThemePack.chart` (inline 5 色) wins; old `default/vivid/pastel/monochrome` schemes in `chart-palettes.ts` are retired (file now only exports the `ChartPalette` type)
5. `primary-colors` / `generateNeutralVars` — deleted in Task 9  

---

## Self-review notes

- No TBD placeholders for required behavior; pack authoring for midnight/forest/warm-paper/graphite is specified by hue seeds + full Academic as template (Task 4 still requires writing complete anchor objects — do not ship academic clones).
- Types consistent: `ThemePackId`, `ThemeIntensity`, `ThemeAnchors`, `ThemeConfig` across tasks.
- Store migration is idempotent via `_themePackMigrated`.
