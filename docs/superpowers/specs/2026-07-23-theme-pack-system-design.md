# Theme Pack 色系主题系统 — 设计规格

**Date:** 2026-07-23
**Status:** Implemented — 实施计划见 `docs/superpowers/plans/2026-07-23-theme-pack-system.md`

**Audience:** 产品 / 设计 / 实现会话

**Related code homes（现状）：**

- 主题生成：`src/renderer/lib/theme/theme-generator.ts`
- 主题包定义：`src/renderer/lib/theme/theme-packs.ts`
- OKLCH 工具：`src/renderer/lib/theme/oklch.ts`
- 主题迁移：`src/renderer/lib/theme/theme-migrate.ts`
- 玻璃：`src/renderer/lib/theme/glass-system.ts`
- 字体：`src/renderer/lib/theme/font-options.ts`
- Store / CSS 注入：`src/renderer/stores/theme-store.ts`
- Appearance UI：`src/renderer/components/modules/settings/appearance-settings.tsx`
- 静态 fallback tokens：`src/renderer/styles/globals.css`
- 表面层级 token：`src/renderer/styles/tokens/chat.css`、`tokens/preview.css`
- i18n：`src/renderer/lib/i18n/locales/{en,zh-CN,zh-HK}.json`

> **⚠️ 范围偏离说明（2026-07-23 shipping）**
>
> 本 spec 初稿设计了「Clean / Balanced / Deep」三档强度派生系统（路径 3）。实现阶段砍掉了强度系统，改为「每包一份手写调好的 palette」（路径 1）。最终 shipped 范围 = 每包单一手写 palette + `themePack` 字段无 `intensity` 字段。下文按 shipped 范围重写。

---

## 0. 一句话定位

> **用户选择的是「一整套内置色系主题包」，不是一个色相；每包是一个手写的五角色色系（Brand / Secondary / Accent / Neutral / Semantic），覆盖 light + dark 两套锚点。**
> 第一期只换色系系统与 Appearance 选择体验；大面积 UI/UX 精修后置。

---

## 1. 背景与问题

### 1.1 现状模型

当前 Appearance「主题色」本质是：

1. 选一个 **primary hue**（Sapphire / Amethyst / …）
2. 用 **连续强度滑杆**（`baseIntensity: 0–1`）把同一 hue 以不同 chroma 注入 background / card / muted / accent / border / sidebar 等中性表面
3. `--primary` 来自该 hue 的固定 light/dark 值；`--accent` 实际是「略染色的 muted」，不是独立点缀色
4. `--destructive` / `--success` / `--warning` 基本全局固定，几乎不随主题变化

结果：换主题时，整站更像「同一种颜色的浓淡变化」，而不是 Radix / shadcn 那种 **多角色、多色相协作的色系**。

### 1.2 目标

1. 内置 **氛围型主题包**（第一版 5 个），用户只选包，不分别挑角色色。
2. 每个包是完整 **五色角色色系**（含可随主题微调的语义色），手写 light + dark 锚点。
3. 继续输出现有 shadcn CSS 变量名，**尽量不改组件 class**。
4. 旧 `primaryColor` + `baseIntensity` 可一次性迁移。
5. 为后续 UI/UX 精修提供稳定 token 基础。

### 1.3 非目标（本阶段明确不做）

- 用户自选 Primary / Secondary / Accent（含「高级」面板）
- 连续 0–100% 强度滑杆
- 强度档位（Clean / Balanced / Deep） — **初稿有，shipping 砍掉**
- 自建完整 Radix 式 1–12 公开色阶 API
- 大面积重做聊天 / 设置 / 编辑器视觉（只换 token 源）
- 独立 editor 主题市场或复杂 chart 选择器（第一版 chart 跟主题包默认绑定）
- 用户导入 / 导出自定义主题 JSON（可后置）

### 1.4 成功标准

1. Appearance 可选 5 个主题包；预览能看出多色差异（4 色点条，而非单圆点）。
2. light / dark × 5 包 下，主按钮、正文、muted、destructive 对比度可用。
3. 旧配置用户升级后落到合理包，无需手动重设。
4. 组件侧无需为换主题而批量改 Tailwind class。
5. 全部主题用 OKLCH 表达，跨包可量化对比（hue 差、chroma 范围、lightness 阶）。

---

## 2. 产品决策摘要

| 决策点 | 选择 |
|--------|------|
| 选择方式 | 仅内置主题包（方案 A） |
| 色系结构 | 五色全包，含 Semantic（方案 C） |
| 强度档位 | **shipping 砍掉**；每包单一手写 palette |
| 命名风格 | 氛围型，不沿用宝石单色名（方案 B） |
| 第一版数量 | 精简 5 个（方案 A） |
| 实现路径 | 路径 1（手写每包 light/dark 锚点，不派生） |

---

## 3. 主题包名单

| ID | 显示名 | 性格 | 色感方向 |
|----|--------|------|----------|
| `academic` | Academic | 默认推荐：冷静、学术、高可读 | 蓝 Brand + 冷灰壳 + 金色伴侣 Accent |
| `midnight` | Midnight | 深空、专注、偏暗友好 | 紫 Brand + 冷壳 + 青绿 Accent |
| `forest` | Forest | 自然、稳重、长时阅读 | 翠绿 Brand + 橄榄壳 + 琥珀 Accent |
| `warm-paper` | Warm Paper | 纸质、温暖、写作感 | 赤陶 Brand + 暖石壳 + 青绿 Accent |
| `graphite` | Graphite | 极简、少色相干扰 | 纯灰黑白；无 companion hue；selection 用明度阶 |

**默认：** `themePack: "academic"`。

**每包特性（shipping 后实测）：**
- 4 角色（Brand、Secondary、Accent、Semantic）都是该包性格的「独立色相」
- Companion Accent chroma 控制在 `0.02–0.06`（保证是「淡彩」不是「响亮」）
- 5 色 chart palette 跟包性格衍生（品牌 + 伴侣 + 三辅色）
- Graphite 是唯一例外：所有 chroma = 0，纯灰

**Appearance 预览：** 每个选项展示 4 个 swatch（顺序：Brand、Accent、背景、destructive），表达「一套色」而非单色。

---

## 4. 色系角色与 Token 映射

### 4.1 五组角色

| 角色 | 职责 | 主要 CSS 变量 |
|------|------|----------------|
| **Brand** | 主操作、选中、关键 CTA、焦点环 | `--primary`、`--primary-foreground`、`--ring`、`--sidebar-primary*` |
| **Secondary** | 次要按钮、弱强调、成对对比 | `--secondary`、`--secondary-foreground` |
| **Accent** | hover 高亮、轻强调面、点缀（**独立色相**，≠ 染色 muted） | `--accent`、`--accent-foreground`；sidebar hover 跟 Accent |
| **Neutral** | 底、字、边、卡片、输入、侧栏壳 | `--background`、`--foreground`、`--card`、`--card-foreground`、`--popover*`、`--muted`、`--muted-foreground`、`--border`、`--input`、`--sidebar*` |
| **Semantic** | 状态反馈（随主题微调，仍保持可识别） | `--destructive`、`--success`、`--warning` 及对应 foreground |

### 4.2 与现状的关键区别

| 现状 | 新系统 |
|------|--------|
| 单一 hue 染遍表面 | Neutral / Accent / Brand 可不同色相 |
| `--accent` ≈ 稍深 muted | `--accent` 为独立点缀角色，chroma 0.02–0.06 |
| 语义色全局固定 | 语义色属于主题包（可微调） |
| 强度 = 连续 chroma 滑杆 | **砍掉**；每包单手写 palette |

### 4.3 Sidebar 规则

- Sidebar 壳层（bg / border / foreground）跟 **Neutral**。
- `--sidebar-primary*` 跟 **Brand**。
- `--sidebar-accent*` 跟 **Accent**（手写每个包，确保 hover 可读）。
- 不单独引入第六用户可见角色；sidebar 是映射细节，不是 Appearance 选项。

### 4.4 仍与色系解耦的配置

继续留在 `ThemeConfig`，不进主题包色系：

- `radius`（default = `0.625rem`，匹配 shadcn）
- `fontSans` / `fontMono` / `uiFontSize`
- `editorFontFamily` / `editorFontSize`
- `glassEffect` / `glassIntensity`

明暗模式仍由 **next-themes**（`light` / `dark` / `system`）管理，与主题包正交：每个包必须提供 light + dark 两套锚点。

### 4.5 Editor / Chart（第一版约定）

- **Editor chrome**（bg / fg / selection / cursor）：继续由生成器写入；selection / cursor / keyword 跟 Brand。
- **Syntax 其余 token**：保持现有「语义固定色相」策略（string/number/function 等），不强制整套 syntax 换皮。
- **Chart**：每个 `ThemePack` 自带 `chart: ChartPalette`（5 色 light + 5 色 dark），由 pack 性格衍生。`chart-palettes.ts` 的 `default/vivid/pastel/monochrome` 方案在 `intensity` 砍掉的同时退役（文件只剩 `ChartPalette` 类型 + 实际未被引用的常量），由 `theme-packs.ts` 持有 chart 5 色。

---

## 5. 数据模型

### 5.1 用户配置 `ThemeConfig`

```ts
type ThemePackId =
  | "academic"
  | "midnight"
  | "forest"
  | "warm-paper"
  | "graphite";

interface ThemeConfig {
  themePack: ThemePackId;
  radius: number;
  fontSans: string;
  fontMono: string;
  uiFontSize: string;
  editorFontFamily: string;
  editorFontSize: string;
  glassEffect: boolean;
  glassIntensity: GlassTier;
}
```

**删除 / 停止作为真源：** `primaryColor: string`、`baseIntensity: number`、`chartScheme?: ChartSchemeId`、`intensity?: "clean" | "balanced" | "deep"`。

### 5.2 主题包 `ThemePack`

```ts
interface ThemeAnchors {
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

interface ThemePack {
  id: ThemePackId;
  labelKey: string;        // i18n key (settings.appearance.packs.*)
  descriptionKey: string;  // i18n key
  swatches: {
    light: [string, string, string, string]; // Brand, Accent, Background, Destructive
    dark:  [string, string, string, string];
  };
  chart: ChartPalette; // 5-color chart for light + dark, hand-tuned per pack
  balanced: {
    light: ThemeAnchors;
    dark: ThemeAnchors;
  };
  // (字段名 `balanced` 是历史遗留；shipping 后是「唯一 palette」，不是「balanced 锚点 + 派生」)
  // 后续如要重做 intensity 派生，按 plan 14 节开放项处理。
}
```

所有颜色字符串使用 **oklch(...)**，与现栈一致。

### 5.3 持久化

- 仍写入 settings：`_themeConfig: ThemeConfig`（经 `theme-store`）。
- 迁移标记：扩展旧的 `_themeMigrated` 升级为 `_themePackMigrated: true`，保证只迁移一次。
- `globals.css` 中的静态 `:root` / `.dark` 保持作为 **首屏 fallback**；运行时 `#prism-theme` 覆盖。

---

## 6. 生成管线

```text
ThemePack.balanced[mode]
        │
        ▼
 mapAnchorsToCssVars(anchors)  →  Record<CSS var, oklch>
        │
        ▼
 generateThemeCSS(config)      →  :root + .dark 文本
        │
        ▼
 theme-store 注入 #prism-theme（保留现有 debounce）
```

并行写入：radius、fonts、editor syntax vars、glass CSS（逻辑保持，仅 Brand/Neutral 来源改变）。

### 6.1 文件落点

| 文件 | 动作 | 职责 |
|------|------|------|
| `lib/theme/theme-packs.ts` | **新建** | 5 包定义与 registry |
| `lib/theme/oklch.ts` | **新建** | OKLCH parse/format 工具 + chroma 夹紧 |
| `lib/theme/theme-migrate.ts` | **新建** | 旧 `primaryColor` / `themeColor` → pack 迁移 |
| `lib/theme/theme-generator.ts` | **修改** | 新 `ThemeConfig`；组装 CSS；emit 新 CSS var（`--destructive/--success/--warning`） |
| `lib/theme/chart-palettes.ts` | **大砍** | 退役 default/vivid/pastel/monochrome 方案；仅留 `ChartPalette` 类型 |
| `lib/theme/primary-colors.ts` | **删除** | hue preset 整文件无引用 |
| `lib/theme/color-palettes.ts` | **删除** | baseIntensity × hue 派生整文件无引用 |
| `stores/theme-store.ts` | **修改** | 加载 / 保存 / 迁移；`_themePackMigrated` 标记 |
| `appearance-settings.tsx` | **修改** | 主题包 4-swatch 下拉；删除 baseIntensity 滑块；删除 primary 单色下拉 |
| i18n `en` / `zh-CN` / `zh-HK` | **修改** | 包名、描述、swatch 顺序；删除 baseIntensity 文案 |

**新建文件理由：** `theme-packs` / `oklch` / `theme-migrate` 是清晰领域边界，被 generator、store、settings、测试多处引用；符合「domain 模块可新增文件」规则。不把整包数据塞进 `theme-generator.ts`。

---

## 7. 迁移

### 7.1 主题色 → 主题包

| 旧 `primaryColor` / `themeColor` | 新 `themePack` |
|-----------------------------------|----------------|
| `blue` / `teal` / `academic-blue` | `academic` |
| `violet` | `midnight` |
| `green` / `ink-green` | `forest` |
| `amber` / `rose` / `warm-paper`（旧） | `warm-paper` |
| `mono` | `graphite` |
| 未知 | `academic` |

### 7.2 `baseIntensity` → 丢弃

旧 `baseIntensity ∈ [0,1]` 字段直接忽略；新系统不再有强度维度。`ThemeConfig` 不存 `intensity`。

### 7.3 其它字段

- `radius` / fonts / glass：原样保留。
- 若仅有更老的 `themeColor` legacy 路径：先映射到旧 primary，再走 7.1（或直接映到 pack）。
- 迁移后写入新 `ThemeConfig` 形状，并设置 `_themePackMigrated = true`，避免反复覆盖用户之后的选择。

---

## 8. Appearance / i18n

### 8.1 UI 文案方向

- 「主题色」下拉 → 「主题」/ Theme pack 4-swatch 下拉
- 「底色强度」滑块 → **删除**（intensity 系统整段砍掉）
- 各包 short description（一句性格说明）
- 预览：每个 pack 渲染 4 色点（Brand / Accent / Background / Destructive）

### 8.2 语言

同步更新 `en.json`、`zh-CN.json`、`zh-HK.json`。包名沿用英文（产品命名规范，不翻译）；描述句本地化。

---

## 9. 测试与验收

### 9.1 自动化（已 shipping）

- `theme-packs.test.ts`：5 包 hue 互不重叠、accent chroma 0.02–0.06、accent hueDelta > 60° vs brand、graphite 全 0 chroma、chart 5 色 light+dark、每包 swatches 4 个
- `theme-oklch.test.ts`：parse / format / chroma 夹紧 / alpha round-trip
- `theme-migrate.test.ts`：blue→academic、violet→midnight、green→forest、mono→graphite、academic-blue legacy、passthrough 新形状
- `theme-generator.test.ts`：emit 含 semantic token（`--destructive/--success/--warning`）、academic 默认、`--editor-bg` = `--card`、`--pdf-canvas` = `--muted`、5 包 × 5 chart 都存在

### 9.2 手动矩阵

- 5 packs × `{light, dark}`
- 抽查：Primary 按钮、Secondary、Accent hover、侧栏选中、输入框边框、destructive 按钮、成功/警告提示（若 UI 有）
- Graphite：确认表面不出现明显彩色染色
- 切换包即时生效；重置回到 Academic

### 9.3 非回归

- 玻璃效果开关仍可用
- 字体 / 圆角设置不受色系迁移破坏
- 无主题 CSS 时 `globals.css` fallback 仍可启动
- **Git status colors — hybrid theming:** added/untracked → `text-success`, deleted → `text-destructive` (both stay green/red-family across all 5 packs, safe to theme); modified (amber) and renamed (violet) keep fixed Tailwind colors — `modified` is not semantically a warning, and `renamed` would otherwise be hijacked by the pack's brand primary color (blue/violet/green/terracotta/black)
- 旧 `primaryColor` / `baseIntensity` 用户升级后自动落到合理包，无 console 报错

---

## 10. 分阶段交付

### Phase 1（已 shipping）

1. 数据模型与 pack registry（5 包手写锚点）
2. ~~intensity derive~~ — 砍掉
3. generator + store + 迁移
4. Appearance UI + i18n
5. 测试与手动矩阵

### Phase 2（后置，另开 spec/plan）

- 基于新 token 逐块打磨 UI/UX（聊天工具栏、权限面板、设置卡片、编辑器 chrome 等）
- 可选：更多主题包、导出/导入、chart 独立选择器、intensity 派生（如果用户诉求回来）

---

## 11. 风险与约束

| 风险 | 缓解 |
|------|------|
| 五包手写工作量大 | 先定 Academic 为标定包，其余按性格模板扩展；只用单一 `balanced` 锚点，不派生 |
| 砍 intensity 后用户嫌「可选维度变少」 | 4 swatch 预览 + description 让包性格自解释；Phase 2 评估是否补回 intensity |
| `--accent` 语义变化导致局部 hover 过艳/过淡 | chroma 0.02–0.06 限制 + 单测 lock；Phase 1 接受少量视觉差异 |
| 旧用户觉得「宝石色没了」 | 迁移到氛围包 + 文案说明；预览 swatch 帮助识别 |
| 某包 anchor 写错导致对比度翻车 | `theme-packs.test.ts` 测 accent≠muted、card.l≥0.99、graphite c=0 等关键不变量 |

---

## 12. 已否决方案（备忘）

- 用户分别选择角色色 / 高级自定义面板
- 保留连续强度滑杆作为主交互
- 强度档位 Clean/Balanced/Deep + 派生（路径 3） — **shipping 砍掉**
- 全手工写满 5×2×3 套 token（维护爆炸）
- 全算法从单一种子生成整包（易回退到「单色浓淡」观感）
- 第一版 8～10+ 主题包
- 沿用 Sapphire 等单色命名作为主列表

---

## 13. 开放实现细节（plan 阶段确定即可）

以下不阻塞本规格批准，但写 plan 时需给出初值：

1. 每包锚点手写指南（5 角色 + semantic 怎么挑 hue / chroma / L）
2. 对比度目标阈值（如正文 vs bg、muted vs bg、destructive 按钮）
3. Appearance 主题选择器用 Select 还是卡片网格（shipping 选 Select + 4 swatch）
4. `chart-palettes.ts` 旧方案如何收尾（shipping：保留 `ChartPalette` 类型，删常量；`vivid/pastel/monochrome` 不再被引用）
5. `primary-colors.ts` / `color-palettes.ts` 是删除还是标 `@deprecated`（shipping：直接删）

---

## 14. 审批记录

| 日期 | 结论 |
|------|------|
| 2026-07-23 | 产品决策与路径 3 经对话确认；规格审阅通过 |
| 2026-07-23 (impl) | 实现阶段砍掉 intensity 系统，改为每包单手写 palette（路径 1）；本 spec 按 shipped 范围重写 |
