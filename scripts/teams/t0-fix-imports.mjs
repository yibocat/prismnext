#!/usr/bin/env node
/** T0 补 import 路径（codemod 第二步）。幂等。 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry-run");

const PATH_MAP = [
  ["shared/packs/types", "shared/teams/types"],
  ["shared/packs/state", "shared/teams/state"],
  ["shared/packs/frontmatter", "shared/teams/frontmatter"],
  ["shared/packs/index", "shared/teams/index"],
  ["shared/packs", "shared/teams"],
  ["shared/expert-team-preamble", "shared/subagent-team-preamble"],
  ["@shared/packs/types", "@shared/teams/types"],
  ["@shared/packs", "@shared/teams"],
  ["@shared/agent-experts", "@shared/agent-subagents"],
  ["services/pack-catalog", "services/team-catalog"],
  ["services/pack-resolver", "services/team-resolver"],
  ["services/packs-state", "services/teams-state"],
  ["services/packs-installed", "services/teams-installed"],
  ["services/packs-lifecycle", "services/teams-lifecycle"],
  ["services/packs-license", "services/teams-license"],
  ["services/user-packs", "services/user-teams"],
  ["services/pro-packs-discovery", "services/pro-teams-discovery"],
  ["services/experts-sync", "services/subagents-sync"],
  ["services/agent-experts", "services/agent-subagents"],
  ["services/project-experts-refresh", "services/project-subagents-refresh"],
  ["services/core-pack-skills", "services/core-team-skills"],
  ["./pack-catalog", "./team-catalog"],
  ["./pack-resolver", "./team-resolver"],
  ["./packs-state", "./teams-state"],
  ["./packs-installed", "./teams-installed"],
  ["./packs-lifecycle", "./teams-lifecycle"],
  ["./packs-license", "./teams-license"],
  ["./user-packs", "./user-teams"],
  ["./pro-packs-discovery", "./pro-teams-discovery"],
  ["./experts-sync", "./subagents-sync"],
  ["./agent-experts", "./agent-subagents"],
  ["./project-experts-refresh", "./project-subagents-refresh"],
  ["./core-pack-skills", "./core-team-skills"],
  ["./packs\"", "./teams\""],
  ["./experts\"", "./subagents\""],
  ["./user-packs\"", "./user-teams\""],
  ["stores/packs-store", "stores/teams-store"],
  ["./packs-store", "./teams-store"],
  ["teams-agents-settings", "teams-settings"],
  ["pack-detail-panel", "team-detail-panel"],
  ["expert-editor-panel", "subagent-editor-panel"],
  ["modules/teams/pack-icon", "modules/teams/team-icon"],
  ["./pack-icon", "./team-icon"],
];

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".jsonc"]);
const SKIP_DIR = new Set(["node_modules", ".git", "out", "dist", ".pnpm-store", "legacy-backup"]);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.has(p.slice(p.lastIndexOf(".")))) yield p;
  }
}

const sorted = [...PATH_MAP].sort((a, b) => b[0].length - a[0].length);
let changed = 0;
for (const base of ["src", "tests", "scripts"]) {
  const abs = join(ROOT, base);
  if (!existsSync(abs)) continue;
  for (const f of walk(abs)) {
    if (f.includes("scripts/teams/")) continue;
    const original = readFileSync(f, "utf-8");
    let out = original;
    for (const [from, to] of sorted) out = out.split(from).join(to);
    if (out !== original) {
      changed++;
      if (!DRY) writeFileSync(f, out, "utf-8");
    }
  }
}
console.log(`${DRY ? "[dry] " : ""}import-path files changed: ${changed}`);
