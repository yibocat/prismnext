/**
 * pack-catalog.ts —— pack 根的注册、发现与目录扫描（§4.1 / §8.2）。
 *
 * 三类 pack 根：
 * - first-party：`resources/plugins/`（随 app 打包，含 core pack）
 * - external：运行期注册的目录（Pro 私有包 `packs/`，Phase 5 由 pro-packs-discovery 调用）
 * - local：`<projectRoot>/.prismnext/agent/local/`（用户自建内容，虚拟 manifest）
 *
 * 职责边界：只回答「磁盘上有哪些 pack、每个 pack 里有什么内容」。
 * 安装/启停/override 归 packs-state.ts；语义解析归 pack-resolver.ts。
 */

import { app } from "electron";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  ContentKind,
  ExpertDef,
  McpDef,
  OrchestratorDef,
  PackKind,
  PackManifest,
  PackView,
} from "../../shared/packs/types";
import { CORE_PACK_ID, LOCAL_PACK_ID, LOCAL_PACK_REL } from "../../shared/packs/types";
import { fmInt, fmString, parseFlatFrontmatter } from "../../shared/packs/frontmatter";
import { createLogger } from "./logger";
import { licenseGrants } from "./packs-license";

const log = createLogger("pack-catalog");

// ── 扫描结果 ──────────────────────────────────────────────

export interface ScannedContentItem {
  kind: ContentKind;
  id: string;
  name: string;
  description: string;
  /** 内容目录绝对路径（command 为 .md 文件路径） */
  path: string;
  /** orchestrator/expert 的解析定义（已剔除身份字段，身份由 pack 归属推导） */
  definition?: OrchestratorDef | ExpertDef;
  /** command 的解析负载 */
  command?: {
    template: string;
    action?: string;
    agent?: string;
    model?: string;
    order: number;
  };
}

// ── pack 根 ───────────────────────────────────────────────

/** first-party packs 目录（dev + packaged；vitest 回退仓库布局） */
export function getFirstPartyPacksDir(): string {
  // 测试 / 工具可用环境变量把 first-party 根指到隔离目录（fixture 密封）。
  const override = process.env.PRISM_FIRST_PARTY_PACKS_DIR?.trim();
  if (override) return override;
  const devFallback = join(process.cwd(), "resources", "plugins");
  try {
    if (!app) return devFallback;
    if (app.isPackaged) return join(process.resourcesPath, "resources", "plugins");
    const appPath = app.getAppPath();
    return existsSync(appPath) ? join(appPath, "resources", "plugins") : devFallback;
  } catch {
    return devFallback;
  }
}

/** external roots（§8.2 唯一注册口；Phase 5 的 pro-packs-discovery 调它） */
const externalRoots = new Map<string, string>(); // normalized dir → dir

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function registerExternalPackRoot(dir: string): void {
  const key = normalizeDir(dir);
  if (externalRoots.has(key)) return;
  externalRoots.set(key, dir);
  invalidateCatalog();
}

export function unregisterExternalPackRoot(dir: string): void {
  if (externalRoots.delete(normalizeDir(dir))) invalidateCatalog();
}

export function listExternalPackRoots(): string[] {
  return [...externalRoots.values()];
}

export function getLocalPackDir(projectRoot: string): string {
  return join(projectRoot, LOCAL_PACK_REL);
}

// ── manifest 读取与校验 ───────────────────────────────────

function readPackManifest(dir: string): PackManifest | null {
  const path = join(dir, "plugin.json");
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    log.warn("plugin.json 解析失败，跳过该 pack", { dir, error: String(err) });
    return null;
  }
  const m = raw as Partial<PackManifest>;
  if (
    !m ||
    typeof m.id !== "string" ||
    !m.id ||
    typeof m.name !== "string" ||
    typeof m.description !== "string" ||
    typeof m.version !== "string" ||
    m.packFormatVersion !== 1 ||
    (m.tier !== "free" && m.tier !== "pro") ||
    typeof m.publisher !== "string" ||
    !m.publisher
  ) {
    log.warn("plugin.json 不符合 packFormatVersion 1，跳过该 pack", { dir });
    return null;
  }
  return m as PackManifest;
}

// ── 内容扫描 ──────────────────────────────────────────────

function scanAgentDefs(
  packDir: string,
  kind: "orchestrator" | "expert",
): ScannedContentItem[] {
  const subdir = kind === "orchestrator" ? "orchestrators" : "experts";
  const jsonName = kind === "orchestrator" ? "orchestrator.json" : "expert.json";
  const root = join(packDir, subdir);
  if (!existsSync(root)) return [];
  const out: ScannedContentItem[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const jsonPath = join(dir, jsonName);
    if (!existsSync(jsonPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
      if (raw.id !== undefined && raw.id !== entry.name) {
        log.warn(`${jsonName} 的 id 与目录名不一致，以目录名为准`, { dir, jsonId: raw.id });
      }
      // 白名单字段——身份字段（builtin/removable/pluginId）一律丢弃（§4.3）
      const definition = {
        id: entry.name,
        name: typeof raw.name === "string" ? raw.name : entry.name,
        description: typeof raw.description === "string" ? raw.description : "",
        model: typeof raw.model === "string" ? raw.model : undefined,
        thoughtLevel: typeof raw.thoughtLevel === "string" ? raw.thoughtLevel : undefined,
        temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
        ...(kind === "orchestrator"
          ? { allowedExperts: Array.isArray(raw.allowedExperts) ? (raw.allowedExperts as string[]) : undefined }
          : { modules: Array.isArray(raw.modules) ? (raw.modules as string[]) : undefined }),
        permission:
          raw.permission && typeof raw.permission === "object" && !Array.isArray(raw.permission)
            ? (raw.permission as Record<string, unknown>)
            : undefined,
      } as OrchestratorDef | ExpertDef;
      out.push({
        kind,
        id: entry.name,
        name: definition.name,
        description: definition.description,
        path: dir,
        definition,
      });
    } catch (err) {
      log.warn(`${jsonName} 解析失败，跳过`, { dir, error: String(err) });
    }
  }
  return out;
}

function scanSkills(packDir: string): ScannedContentItem[] {
  const root = join(packDir, "skills");
  if (!existsSync(root)) return [];
  const out: ScannedContentItem[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const skillMdPath = join(dir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    let name = entry.name;
    let description = "";
    try {
      const parsed = parseFlatFrontmatter(readFileSync(skillMdPath, "utf-8"));
      if (parsed) {
        name = fmString(parsed.fm, "name") ?? entry.name;
        description = fmString(parsed.fm, "description") ?? "";
      }
    } catch (err) {
      log.warn("SKILL.md 读取失败，按裸目录处理", { dir, error: String(err) });
    }
    out.push({ kind: "skill", id: entry.name, name, description, path: dir });
  }
  return out;
}

function scanCommands(packDir: string): ScannedContentItem[] {
  const root = join(packDir, "commands");
  if (!existsSync(root)) return [];
  const out: ScannedContentItem[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const id = entry.name.replace(/\.md$/, "");
    const filePath = join(root, entry.name);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = parseFlatFrontmatter(raw);
      out.push({
        kind: "command",
        id,
        name: id,
        description: parsed ? (fmString(parsed.fm, "description") ?? "") : "",
        path: filePath,
        command: {
          template: parsed ? parsed.body : raw.trim(),
          action: parsed ? fmString(parsed.fm, "action") : undefined,
          agent: parsed ? fmString(parsed.fm, "agent") : undefined,
          model: parsed ? fmString(parsed.fm, "model") : undefined,
          order: parsed ? fmInt(parsed.fm, "order", 1000) : 1000,
        },
      });
    } catch (err) {
      log.warn("command 读取失败，跳过", { filePath, error: String(err) });
    }
  }
  return out;
}

export function readPackMcpDefs(packDir: string): McpDef[] {
  const path = join(packDir, "mcp.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (m): m is McpDef => m && typeof m.id === "string" && typeof m.name === "string" && !!m.transport,
    );
  } catch (err) {
    log.warn("mcp.json 解析失败，按空处理", { packDir, error: String(err) });
    return [];
  }
}

export function scanPackContents(packDir: string): ScannedContentItem[] {
  return [
    ...scanAgentDefs(packDir, "orchestrator"),
    ...scanAgentDefs(packDir, "expert"),
    ...scanSkills(packDir),
    ...scanCommands(packDir),
  ];
}

/** contents 展示声明 vs 扫描结果校验（§4.2.2：永远以扫描为准，不一致记 warning） */
function validateContentsDecl(manifest: PackManifest, items: ScannedContentItem[], mcps: McpDef[]): void {
  if (!manifest.contents) return;
  const found = new Set(items.map((i) => `${i.kind}:${i.id}`));
  for (const m of mcps) found.add(`mcp:${m.id}`);
  const groups: Array<[keyof NonNullable<PackManifest["contents"]>, ContentKind]> = [
    ["orchestrators", "orchestrator"],
    ["experts", "expert"],
    ["skills", "skill"],
    ["commands", "command"],
    ["mcps", "mcp"],
  ];
  for (const [key, kind] of groups) {
    for (const decl of manifest.contents[key] ?? []) {
      if (!found.has(`${kind}:${decl.id}`)) {
        log.warn(`plugin.json contents 声明了目录中不存在的 ${kind}「${decl.id}」，以扫描为准`, {
          packId: manifest.id,
        });
      }
    }
  }
}

// ── PackView 计算 ─────────────────────────────────────────

function hostVersion(): string | null {
  try {
    if (app && typeof app.getVersion === "function") return app.getVersion();
  } catch {
    // vitest / 非 Electron 环境
  }
  return process.env.npm_package_version ?? null;
}

function semverGte(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

function classify(manifest: PackManifest, rootKind: "firstparty" | "external"): PackKind {
  if (manifest.id === CORE_PACK_ID) return "core";
  return rootKind;
}

function toPackView(
  manifest: PackManifest,
  dir: string,
  rootKind: "firstparty" | "external",
): PackView {
  const kind = classify(manifest, rootKind);
  const host = hostVersion();
  const compatible =
    !manifest.minHostVersion || !host || semverGte(host, manifest.minHostVersion);
  return {
    manifest,
    kind,
    dir,
    installedByDefault: kind === "core" || kind === "local",
    locked: manifest.tier === "pro" && !licenseGrants(manifest.feature),
    compatible,
  };
}

/** Local Pack 虚拟 manifest（§4.5.3：不落盘；name 为占位，UI 阶段按 id 本地化） */
export function getLocalPackView(projectRoot: string): PackView {
  return {
    manifest: {
      id: LOCAL_PACK_ID,
      name: "My Content",
      description: "Orchestrators, experts, skills and commands created in this project.",
      version: "0.0.0",
      packFormatVersion: 1,
      tier: "free",
      publisher: "user",
    },
    kind: "local",
    dir: getLocalPackDir(projectRoot),
    installedByDefault: true,
    locked: false,
    compatible: true,
  };
}

// ── 缓存 ──────────────────────────────────────────────────

interface CatalogSnapshot {
  fingerprint: string;
  packs: PackView[];
  byId: Map<string, PackView>;
  contents: Map<string, ScannedContentItem[]>;
  mcps: Map<string, McpDef[]>;
}

let cache: CatalogSnapshot | null = null;

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/** 收集影响缓存的文件（plugin.json + 各内容文件）的 stat 指纹 */
function packDirFingerprint(packDir: string): string {
  const parts: string[] = [];
  const addFile = (p: string) => {
    try {
      const st = statSync(p);
      parts.push(`${p}:${st.mtimeMs}:${st.size}`);
    } catch {
      // 文件消失也算指纹变化的一部分（路径缺失）
    }
  };
  addFile(join(packDir, "plugin.json"));
  for (const [subdir, jsonName] of [
    ["orchestrators", "orchestrator.json"],
    ["experts", "expert.json"],
  ] as const) {
    const root = join(packDir, subdir);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root)) {
      addFile(join(root, e, jsonName));
      addFile(join(root, e, "instructions.md"));
    }
  }
  const skillsRoot = join(packDir, "skills");
  if (existsSync(skillsRoot)) {
    for (const e of readdirSync(skillsRoot)) addFile(join(skillsRoot, e, "SKILL.md"));
  }
  const commandsRoot = join(packDir, "commands");
  if (existsSync(commandsRoot)) {
    for (const e of readdirSync(commandsRoot)) {
      if (e.endsWith(".md")) addFile(join(commandsRoot, e));
    }
  }
  addFile(join(packDir, "mcp.json"));
  return parts.sort().join("|");
}

function computeFingerprint(): string {
  const roots = [getFirstPartyPacksDir(), ...listExternalPackRoots()];
  const parts: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(root, entry.name);
      if (!existsSync(join(dir, "plugin.json"))) continue;
      parts.push(packDirFingerprint(dir));
    }
  }
  return djb2(parts.sort().join("||"));
}

function buildSnapshot(): CatalogSnapshot {
  const packs: PackView[] = [];
  const byId = new Map<string, PackView>();
  const contents = new Map<string, ScannedContentItem[]>();
  const mcps = new Map<string, McpDef[]>();

  const roots: Array<{ dir: string; kind: "firstparty" | "external" }> = [
    { dir: getFirstPartyPacksDir(), kind: "firstparty" },
    ...listExternalPackRoots().map((dir) => ({ dir, kind: "external" as const })),
  ];

  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    for (const entry of readdirSync(root.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(root.dir, entry.name);
      const manifest = readPackManifest(dir);
      if (!manifest) continue;
      if (byId.has(manifest.id)) {
        log.warn("pack id 冲突，后到者被忽略", { packId: manifest.id, dir, kept: byId.get(manifest.id)!.dir });
        continue;
      }
      const view = toPackView(manifest, dir, root.kind);
      const items = scanPackContents(dir);
      const mcpDefs = readPackMcpDefs(dir);
      validateContentsDecl(manifest, items, mcpDefs);
      packs.push(view);
      byId.set(manifest.id, view);
      contents.set(manifest.id, items);
      mcps.set(manifest.id, mcpDefs);
    }
  }

  packs.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  return { fingerprint: computeFingerprint(), packs, byId, contents, mcps };
}

function getCatalog(): CatalogSnapshot {
  if (cache && cache.fingerprint === computeFingerprint()) return cache;
  cache = buildSnapshot();
  return cache;
}

export function invalidateCatalog(): void {
  cache = null;
}

/** 当前目录树的指纹（resolver 视图缓存键的一部分；会触发一次新鲜度校验） */
export function currentCatalogFingerprint(): string {
  return getCatalog().fingerprint;
}

/** 任意 pack 布局目录的内容指纹（resolver 用于 local pack 目录） */
export function contentDirFingerprint(dir: string): string {
  if (!existsSync(dir)) return "absent";
  return djb2(packDirFingerprint(dir));
}

// ── 对外查询 ──────────────────────────────────────────────

/** 全部已发现的 app 级 pack（first-party + external；不含 local——local 走 getLocalPackView） */
export function listPacks(): PackView[] {
  return getCatalog().packs;
}

export function getPack(packId: string): PackView | null {
  return getCatalog().byId.get(packId) ?? null;
}

export function getPackContents(packId: string): ScannedContentItem[] {
  return getCatalog().contents.get(packId) ?? [];
}

export function getPackMcpDefs(packId: string): McpDef[] {
  return getCatalog().mcps.get(packId) ?? [];
}

/** Local Pack 的内容扫描（目录可能不存在 → 空） */
export function scanLocalPackContents(projectRoot: string): ScannedContentItem[] {
  const dir = getLocalPackDir(projectRoot);
  if (!existsSync(dir)) return [];
  return scanPackContents(dir);
}
