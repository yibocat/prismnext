#!/usr/bin/env node
/**
 * Regenerate zh-HK.json from zh-CN.json.
 *
 * Pipeline:
 * 1) OpenCC cn → twp (phrase-aware Traditional: 檔案/儲存/預設/資訊…)
 * 2) Hong Kong lexicon overlays where HK wording differs from Taiwan.
 *
 * Usage: node scripts/generate-zh-hk-locale.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenCC from "opencc-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "src/renderer/lib/i18n/locales/zh-CN.json");
const dstPath = path.join(root, "src/renderer/lib/i18n/locales/zh-HK.json");

const toTrad = OpenCC.Converter({ from: "cn", to: "twp" });

/** Longer phrases first. Applied after OpenCC. */
const HK_PHRASES = [
  ["軟體", "軟件"],
  ["網路", "網絡"],
  ["螢幕", "熒幕"],
  ["滑鼠", "鼠標"],
  ["硬碟", "硬盤"],
  ["記憶體", "內存"],
  ["標籤頁", "分頁"],
  ["關閉標籤頁", "關閉分頁"],
];

function applyHkLexicon(text) {
  let out = text;
  for (const [from, to] of HK_PHRASES) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function convertValue(v) {
  if (typeof v === "string") return applyHkLexicon(toTrad(v));
  if (Array.isArray(v)) return v.map(convertValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = convertValue(val);
    return out;
  }
  return v;
}

const cn = JSON.parse(fs.readFileSync(srcPath, "utf8"));
const hk = convertValue(cn);
hk.localeName = {
  en: "English",
  zhCN: "簡體中文",
  zhHK: "繁體中文（香港）",
};

fs.writeFileSync(dstPath, `${JSON.stringify(hk, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, dstPath)}`);
console.log("sample:", hk.common.save, hk.menu.file, hk.menu.closeTab, hk.settings.general.language);
