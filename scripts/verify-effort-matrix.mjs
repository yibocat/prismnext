#!/usr/bin/env node
/**
 * Effort / reasoning depth audit — catalog vs opencode.json variants vs preset.
 *
 * Usage:
 *   node scripts/verify-effort-matrix.mjs
 *   node scripts/verify-effort-matrix.mjs --provider opencode-go
 *   node scripts/verify-effort-matrix.mjs --runtime   # hints for manual UI test
 *
 * Reads OpenCode cache from macOS default userData (override with OPENCODE_USER_DATA).
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const OPENCODE_DEFAULT_VARIANT = "default";
const OPENCODE_REASONING_FROM_CATALOG_MIN = "1.18.0";

function loadPinnedOpencodeVersion() {
  const path = join(process.cwd(), "scripts", "opencode-version.txt");
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim() && !l.trim().startsWith("#"));
  const m = line?.trim().match(/^v?(\d+\.\d+\.\d+)/i);
  return m?.[1] ?? null;
}

function parseVersionParts(version) {
  const m = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function openCodeVersionAtLeast(version, minimum) {
  const a = version ? parseVersionParts(version) : null;
  const b = parseVersionParts(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function shouldSkipEffortVariantConfigSync(version) {
  return openCodeVersionAtLeast(version, OPENCODE_REASONING_FROM_CATALOG_MIN);
}

function runtimeProviderId(prismId) {
  if (prismId === "opencode-zen") return "opencode";
  return prismId;
}

/** @param {unknown} options */
function effortIdsFromReasoningOptions(options) {
  if (!Array.isArray(options)) return [];
  const out = [];
  for (const opt of options) {
    if (!opt || typeof opt !== "object") continue;
    if (opt.type === "effort" && Array.isArray(opt.values)) {
      for (const value of opt.values) {
        if (typeof value === "string") out.push(value);
      }
    } else if (opt.type === "toggle") {
      out.push("none", "thinking");
    } else if (opt.type === "budget_tokens") {
      out.push("high", "max");
    }
  }
  return [...new Set(out.filter((k) => k && k !== OPENCODE_DEFAULT_VARIANT))];
}

/** budget_tokens reasoning_options expose high/max variant ids (same as Prism UI). */
function budgetEffortIds(options) {
  if (!Array.isArray(options)) return [];
  const budget = options.find((o) => o?.type === "budget_tokens");
  if (!budget) return [];
  return ["high", "max"];
}

function userDataDir() {
  if (process.env.OPENCODE_USER_DATA) return process.env.OPENCODE_USER_DATA;
  const app = "prismnext";
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", app, "opencode-server");
  }
  if (platform() === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), app, "opencode-server");
  }
  return join(homedir(), ".config", app, "opencode-server");
}

function loadModelsJson(serverDir) {
  const path = join(serverDir, "cache", "opencode", "models.json");
  if (!existsSync(path)) return { path, data: null };
  return { path, data: JSON.parse(readFileSync(path, "utf8")) };
}

function loadOpencodeConfig(serverDir) {
  const path = join(serverDir, "config", "opencode", "opencode.json");
  if (!existsSync(path)) return { path, config: null };
  return { path, config: JSON.parse(readFileSync(path, "utf8")) };
}

/** @param {string} prismProviderId */
function runtimeCacheKey(prismProviderId) {
  if (prismProviderId === "opencode-zen") return "opencode";
  return prismProviderId;
}

/** @param {Record<string, unknown>|null} config @param {string} providerId @param {string} modelId */
function injectedVariantKeys(config, providerId, modelId) {
  const runtimeId = providerId === "opencode-zen" ? "opencode" : providerId;
  const go = config?.provider?.[runtimeId]?.models?.[modelId]?.variants;
  if (!go || typeof go !== "object") return [];
  return Object.keys(go).filter((k) => k !== OPENCODE_DEFAULT_VARIANT);
}

const PRESET_MODELS = {
  "opencode-go": [], // catalog-driven — full models.json section when --preset-only
  "opencode-zen": [], // catalog-driven
  anthropic: [
    "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5",
  ],
  openai: ["gpt-5.2", "gpt-5.1", "gpt-4.1", "o3", "o4-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  openrouter: [],
};

const SEND_PATH = {
  "opencode-go": "set_model opencode-go/<model>/<effort>",
  "opencode-zen": "set_model opencode/<model>/<effort>",
  anthropic: "set_model anthropic/<model>/<effort>",
  openai: "set_model openai/<model>/<effort>",
  google: "set_model google/<model>/<effort>",
  openrouter: "set_model openrouter/<model>/<effort>",
};

function pad(s, n) {
  const t = String(s);
  return t.length >= n ? t : t + " ".repeat(n - t.length);
}

function auditProvider(prismId, modelsJson, opencodeConfig, opts) {
  const cacheKey = runtimeCacheKey(prismId);
  const section = modelsJson?.[cacheKey];
  if (!section?.models) {
    console.log(`\n## ${prismId} — 无 models.json 段 (${cacheKey})\n`);
    return { rows: [], issues: [`missing cache section ${cacheKey}`] };
  }

  const allModels = Object.keys(section.models).sort();
  const presetSet = new Set(PRESET_MODELS[prismId] || []);
  const filterPreset = opts.presetOnly && presetSet.size > 0;
  const modelIds = filterPreset
    ? allModels.filter((id) => presetSet.has(id))
    : allModels;

  console.log(`\n## ${prismId}`);
  console.log(`   catalog: ${cacheKey} | ${allModels.length} 模型`);
  console.log(`   发消息: ${SEND_PATH[prismId] || "set_config_option effort"}`);
  console.log("");

  const hdr = [
    pad("模型", 22),
    pad("Edit(UI)", 28),
    pad("budget*", 12),
    pad("注入variants", 28),
    pad("preset", 6),
    "就绪?",
  ].join("  ");
  console.log(hdr);
  console.log("-".repeat(hdr.length + 10));

  const rows = [];
  const issues = [];

  for (const modelId of modelIds) {
    const m = section.models[modelId];
    const ro = m.reasoning_options;
    const uiEfforts = effortIdsFromReasoningOptions(ro);
    const budget = budgetEffortIds(ro);
    const hasBudgetOnly =
      budget.length > 0 &&
      Array.isArray(ro) &&
      ro.some((o) => o?.type === "budget_tokens") &&
      !ro.some((o) => o?.type === "effort");
    const injected =
      prismId === "opencode-go"
        ? injectedVariantKeys(opencodeConfig, prismId, modelId)
        : injectedVariantKeys(opencodeConfig, prismId, modelId);

    const inPreset = presetSet.has(modelId) ? "Y" : "-";
    const skipInject = opts.skipVariantInject;
    let ready = "—";
    if (uiEfforts.length === 0) {
      ready = "无Edit";
    } else if (prismId === "opencode-go") {
      if (skipInject) {
        ready = "OK(runtime)";
      } else {
        const missing = uiEfforts.filter((e) => !injected.includes(e));
        ready = missing.length === 0 ? "OK" : `缺注入:${missing.join(",")}`;
        if (missing.length) issues.push(`${prismId}/${modelId} missing variants: ${missing.join(",")}`);
      }
    } else {
      ready = "待实测";
    }

    if (hasBudgetOnly && uiEfforts.length < 2) {
      issues.push(`${prismId}/${modelId} UI 可能缺少 budget 档 high/max`);
    }

    const uiStr = uiEfforts.length ? uiEfforts.join(",") : "(none)";
    const budStr = budget.length && hasBudgetOnly ? budget.join(",") : "-";
    const injStr =
      prismId === "opencode-go"
        ? skipInject
          ? "runtime"
          : injected.length
            ? injected.join(",")
            : "(none)"
        : "n/a";

    console.log(
      [
        pad(modelId, 22),
        pad(uiStr, 28),
        pad(budStr, 12),
        pad(injStr, 28),
        pad(inPreset, 6),
        ready,
      ].join("  "),
    );

    rows.push({ modelId, uiEfforts, injected, ready, inPreset });
  }

  // Catalog models with effort not in preset
  if (presetSet.size > 0 && !filterPreset) {
    const extra = allModels.filter(
      (id) => !presetSet.has(id) && effortIdsFromReasoningOptions(section.models[id].reasoning_options).length > 0,
    );
    if (extra.length) {
      console.log(`\n   catalog 有 effort 但 preset 未收录: ${extra.join(", ")}`);
      issues.push(`${prismId}: preset missing effort models: ${extra.join(", ")}`);
    }
  }

  return { rows, issues };
}

function printRuntimeChecklist(prismId, rows) {
  const withEffort = rows.filter((r) => r.uiEfforts.length > 0);
  if (!withEffort.length) return;

  console.log(`\n### 手动验收 — ${prismId}`);
  console.log("在 Prism 选模型 → Edit 选档 → 发「hi」→ 日志应出现：\n");
  for (const r of withEffort) {
    for (const effort of r.uiEfforts) {
      const runtimeId = runtimeProviderId(prismId);
      console.log(
        `  [ ] ${r.modelId} / ${effort}  →  session/set_model ok: ${runtimeId}/${r.modelId}/${effort}`,
      );
    }
  }
}

const args = process.argv.slice(2);
const providerFilter = args.includes("--provider")
  ? args[args.indexOf("--provider") + 1]
  : null;
const runtimeHints = args.includes("--runtime");
const presetOnly = args.includes("--preset-only");

const serverDir = userDataDir();
const pinnedVersion = loadPinnedOpencodeVersion();
const skipVariantInject = shouldSkipEffortVariantConfigSync(pinnedVersion);
const { path: modelsPath, data: modelsJson } = loadModelsJson(serverDir);
const { path: configPath, config: opencodeConfig } = loadOpencodeConfig(serverDir);

console.log("Prism Effort 矩阵审计");
console.log("=".repeat(60));
console.log(`userData: ${serverDir}`);
console.log(`OpenCode pin: ${pinnedVersion ?? "unknown"}${skipVariantInject ? " (≥1.18 — skip variant inject audit)" : ""}`);
console.log(`models.json: ${existsSync(modelsPath) ? modelsPath : "MISSING"}`);
console.log(`opencode.json: ${existsSync(configPath) ? configPath : "MISSING"}`);

if (!modelsJson) {
  console.error("\nmodels.json 不存在 — 请先启动 Prism 并让 OpenCode 拉取 catalog。");
  process.exit(1);
}

const providers = providerFilter
  ? [providerFilter]
  : ["opencode-go", "opencode-zen", "anthropic", "openai", "google"];

const allIssues = [];
const allRows = {};

for (const pid of providers) {
  const { rows, issues } = auditProvider(pid, modelsJson, opencodeConfig, {
    presetOnly,
    skipVariantInject,
  });
  allRows[pid] = rows;
  allIssues.push(...issues);
}

console.log("\n" + "=".repeat(60));
console.log("汇总");
if (allIssues.length === 0) {
  console.log("  静态审计：未发现注入缺口（runtime 仍需手动测）");
} else {
  console.log(`  发现 ${allIssues.length} 项待关注：`);
  for (const i of allIssues) console.log(`    - ${i}`);
}

console.log("\n* budget 列：models.json 有 budget_tokens 且 UI 未含 high/max 时标为待关注");

if (runtimeHints) {
  for (const pid of providers) {
    printRuntimeChecklist(pid, allRows[pid] || []);
  }
} else {
  console.log("\n运行 `node scripts/verify-effort-matrix.mjs --runtime` 输出手动验收清单");
}
