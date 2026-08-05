import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PromptContext } from "../prompts/types";
import {
  type ExpertDefinition,
  type ExpertInfo,
  type ExpertsManifest,
  type OrchestratorDefinition,
  type OrchestratorInfo,
  type OrchestratorsManifest,
  type PrismExpertsSyncState,
  type SaveBuiltinExpertOverridePayload,
  type SaveBuiltinOrchestratorOverridePayload,
  type SaveCustomExpertPayload,
  type SaveCustomOrchestratorPayload,
  DEFAULT_ORCHESTRATOR_ID,
} from "./agent-experts";
import {
  listBundledExpertDefinitions,
  readBundledExpertInstructions,
} from "./bundled-experts";
import {
  listBundledOrchestratorDefinitions,
  readBundledOrchestratorInstructions,
} from "./bundled-orchestrators";
import {
  resolveOrchestratorActiveModuleKeys,
  resolveActiveModuleKeys,
  resolveExpertProfileModuleKeysFor,
  composeOrchestratorProfileModulePrompts,
  composeProfileModulePrompts,
} from "../prompts/resolve-active-modules";
import { buildSubagentRosterMarkdown } from "../../shared/subagent-roster";
import { buildTaskPermissionBlock } from "./task-orchestrator-gate";

export { buildTaskPermissionBlock } from "./task-orchestrator-gate";

export const EXPERTS_MANIFEST_REL = ".prismnext/agent/experts-manifest.json";
export const ORCHESTRATORS_MANIFEST_REL = ".prismnext/agent/orchestrators-manifest.json";
export const CUSTOM_EXPERTS_REL = ".prismnext/agent/experts/custom";
export const CUSTOM_ORCHESTRATORS_REL = ".prismnext/agent/orchestrators/custom";
export const PRISM_EXPERTS_SYNC_REL = "prism-experts-sync.json";

function defaultExpertsManifest(): ExpertsManifest {
  return { disabledBuiltinIds: [] };
}

function defaultOrchestratorsManifest(): OrchestratorsManifest {
  return { defaultOrchestratorId: DEFAULT_ORCHESTRATOR_ID, disabledBuiltinIds: [] };
}

export function readExpertsManifest(projectRoot: string): ExpertsManifest {
  const path = join(projectRoot, EXPERTS_MANIFEST_REL);
  if (!existsSync(path)) return defaultExpertsManifest();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ExpertsManifest;
    return {
      disabledBuiltinIds: Array.isArray(parsed.disabledBuiltinIds)
        ? parsed.disabledBuiltinIds
        : [],
      builtinOverrides:
        parsed.builtinOverrides && typeof parsed.builtinOverrides === "object"
          ? parsed.builtinOverrides
          : undefined,
    };
  } catch {
    return defaultExpertsManifest();
  }
}

export function writeExpertsManifest(projectRoot: string, manifest: ExpertsManifest): void {
  const path = join(projectRoot, EXPERTS_MANIFEST_REL);
  mkdirSync(join(projectRoot, ".prismnext", "agent"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        disabledBuiltinIds: manifest.disabledBuiltinIds ?? [],
        builtinOverrides: manifest.builtinOverrides,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

export function readOrchestratorsManifest(projectRoot: string): OrchestratorsManifest {
  const path = join(projectRoot, ORCHESTRATORS_MANIFEST_REL);
  if (!existsSync(path)) return defaultOrchestratorsManifest();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as OrchestratorsManifest;
    return {
      defaultOrchestratorId:
        parsed.defaultOrchestratorId || DEFAULT_ORCHESTRATOR_ID,
      disabledBuiltinIds: Array.isArray(parsed.disabledBuiltinIds)
        ? parsed.disabledBuiltinIds
        : [],
      builtinOverrides:
        parsed.builtinOverrides && typeof parsed.builtinOverrides === "object"
          ? parsed.builtinOverrides
          : undefined,
    };
  } catch {
    return defaultOrchestratorsManifest();
  }
}

export function writeOrchestratorsManifest(
  projectRoot: string,
  manifest: OrchestratorsManifest,
): void {
  const path = join(projectRoot, ORCHESTRATORS_MANIFEST_REL);
  mkdirSync(join(projectRoot, ".prismnext", "agent"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        defaultOrchestratorId:
          manifest.defaultOrchestratorId ?? DEFAULT_ORCHESTRATOR_ID,
        disabledBuiltinIds: manifest.disabledBuiltinIds ?? [],
        builtinOverrides: manifest.builtinOverrides,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function listCustomExpertDefinitions(projectRoot: string): ExpertDefinition[] {
  const root = join(projectRoot, CUSTOM_EXPERTS_REL);
  if (!existsSync(root)) return [];
  const experts: ExpertDefinition[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const expertPath = join(root, entry.name, "expert.json");
    if (!existsSync(expertPath)) continue;
    try {
      const def = JSON.parse(readFileSync(expertPath, "utf-8")) as ExpertDefinition;
      experts.push({
        ...def,
        id: def.id || entry.name,
        builtin: false,
        removable: true,
      });
    } catch {
      // skip invalid
    }
  }
  return experts;
}

function listCustomOrchestratorDefinitions(projectRoot: string): OrchestratorDefinition[] {
  const root = join(projectRoot, CUSTOM_ORCHESTRATORS_REL);
  if (!existsSync(root)) return [];
  const orchestrators: OrchestratorDefinition[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const orchestratorPath = join(root, entry.name, "orchestrator.json");
    if (!existsSync(orchestratorPath)) continue;
    try {
      const def = JSON.parse(readFileSync(orchestratorPath, "utf-8")) as OrchestratorDefinition;
      orchestrators.push({
        ...def,
        id: def.id || entry.name,
        builtin: false,
        removable: true,
      });
    } catch {
      // skip invalid
    }
  }
  return orchestrators;
}

function instructionsPreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function applyExpertOverride(
  expert: ExpertDefinition,
  override?: Partial<ExpertDefinition>,
): ExpertDefinition {
  if (!override) return expert;
  return {
    ...expert,
    modules: override.modules !== undefined
      ? override.modules.length ? override.modules : undefined
      : expert.modules,
    model: override.model !== undefined ? override.model || undefined : expert.model,
    thoughtLevel: override.thoughtLevel !== undefined
      ? override.thoughtLevel || undefined
      : expert.thoughtLevel,
    temperature: override.temperature !== undefined ? override.temperature : expert.temperature,
    permission: override.permission !== undefined ? override.permission : expert.permission,
  };
}

function applyOrchestratorOverride(
  orchestrator: OrchestratorDefinition,
  override?: Partial<OrchestratorDefinition>,
): OrchestratorDefinition {
  if (!override) return orchestrator;
  return {
    ...orchestrator,
    allowedExperts: override.allowedExperts !== undefined
      ? override.allowedExperts
      : orchestrator.allowedExperts,
    model: override.model !== undefined ? override.model || undefined : orchestrator.model,
    thoughtLevel: override.thoughtLevel !== undefined
      ? override.thoughtLevel || undefined
      : orchestrator.thoughtLevel,
    temperature: override.temperature !== undefined ? override.temperature : orchestrator.temperature,
    permission: override.permission !== undefined ? override.permission : orchestrator.permission,
  };
}

function mergeExpertDefinitions(projectRoot: string): ExpertDefinition[] {
  const manifest = readExpertsManifest(projectRoot);
  const bundled = listBundledExpertDefinitions().map((e) =>
    applyExpertOverride(
      { ...e, builtin: true, removable: false },
      manifest.builtinOverrides?.[e.id],
    ),
  );
  const custom = listCustomExpertDefinitions(projectRoot);
  const byId = new Map<string, ExpertDefinition>();
  for (const e of [...bundled, ...custom]) {
    byId.set(e.id, e);
  }
  return Array.from(byId.values());
}

function mergeOrchestratorDefinitions(projectRoot: string): OrchestratorDefinition[] {
  const manifest = readOrchestratorsManifest(projectRoot);
  const bundled = listBundledOrchestratorDefinitions().map((o) =>
    applyOrchestratorOverride(
      { ...o, builtin: true },
      manifest.builtinOverrides?.[o.id],
    ),
  );
  const byId = new Map<string, OrchestratorDefinition>();
  for (const o of bundled) {
    byId.set(o.id, o);
  }
  for (const o of listCustomOrchestratorDefinitions(projectRoot)) {
    byId.set(o.id, o);
  }
  return Array.from(byId.values());
}

export function readExpertInstructions(
  projectRoot: string,
  expert: ExpertDefinition,
): string {
  if (expert.builtin) {
    return readBundledExpertInstructions(expert.id)?.trim() || "";
  }
  const customPath = join(projectRoot, CUSTOM_EXPERTS_REL, expert.id, "instructions.md");
  if (existsSync(customPath)) {
    return readFileSync(customPath, "utf-8").trim();
  }
  return "";
}

export function readOrchestratorInstructions(
  projectRoot: string,
  orchestrator: OrchestratorDefinition,
): string {
  if (orchestrator.builtin) {
    return readBundledOrchestratorInstructions(orchestrator.id)?.trim() || "";
  }
  const customPath = join(projectRoot, CUSTOM_ORCHESTRATORS_REL, orchestrator.id, "instructions.md");
  if (existsSync(customPath)) {
    return readFileSync(customPath, "utf-8").trim();
  }
  return "";
}

export function listExperts(projectRoot: string): ExpertInfo[] {
  const manifest = readExpertsManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  return mergeExpertDefinitions(projectRoot).map((expert) => {
    const instructions = readExpertInstructions(projectRoot, expert);
    const effectiveModules = resolveActiveModuleKeys({
      role: "expert",
      profileModules: resolveExpertProfileModuleKeysFor(expert),
    });
    return {
      ...expert,
      enabled: expert.builtin ? !disabled.has(expert.id) : true,
      instructionsPreview: instructionsPreview(instructions),
      effectiveModules,
    };
  });
}

export function listOrchestrators(projectRoot: string): OrchestratorInfo[] {
  const manifest = readOrchestratorsManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  const enabledExpertIds = listExperts(projectRoot)
    .filter((e) => e.enabled)
    .map((e) => e.id);
  return mergeOrchestratorDefinitions(projectRoot).map((orchestrator) => {
    const instructions = readOrchestratorInstructions(projectRoot, orchestrator);
    const effectiveModules = resolveOrchestratorActiveModuleKeys();
    const prunedAllowed = pruneAllowedExpertIds(orchestrator.allowedExperts, enabledExpertIds);
    return {
      ...orchestrator,
      allowedExperts: prunedAllowed,
      enabled: orchestrator.builtin ? !disabled.has(orchestrator.id) : true,
      instructionsPreview: instructionsPreview(instructions),
      effectiveModules,
    };
  });
}

export function getExpert(projectRoot: string, expertId: string): ExpertInfo | null {
  return listExperts(projectRoot).find((e) => e.id === expertId) ?? null;
}

export function getOrchestrator(
  projectRoot: string,
  orchestratorId: string,
): OrchestratorInfo | null {
  return listOrchestrators(projectRoot).find((o) => o.id === orchestratorId) ?? null;
}

export function resolveOrchestratorId(
  projectRoot: string,
  tabOrchestratorId?: string | null,
): string {
  const explicit = tabOrchestratorId?.trim();
  if (explicit) {
    const found = getOrchestrator(projectRoot, explicit);
    if (found?.enabled) return found.id;
  }
  const manifest = readOrchestratorsManifest(projectRoot);
  const defaultId = manifest.defaultOrchestratorId || DEFAULT_ORCHESTRATOR_ID;
  const found = getOrchestrator(projectRoot, defaultId);
  return found?.enabled ? found.id : DEFAULT_ORCHESTRATOR_ID;
}

function appendCapabilityRefs(
  def: ExpertDefinition | OrchestratorDefinition,
  body: string,
  promptCtx: PromptContext = {},
  role: "orchestrator" | "expert",
): string {
  // Experts compose from their manifest `modules` subset — an expert Task
  // call pays the full system-side cost of every module we attach.
  const modulePrompts =
    role === "orchestrator"
      ? composeOrchestratorProfileModulePrompts(promptCtx)
      : composeProfileModulePrompts(resolveExpertProfileModuleKeysFor(def), promptCtx);
  const sections: string[] = [body.trim()];
  if (modulePrompts) {
    sections.push("", "---", "", modulePrompts);
  }
  return sections.join("\n");
}

function yamlScalar(value: string): string {
  if (/[:#\n"'&*]|^\s/.test(value)) return JSON.stringify(value);
  return value;
}

/** Quote YAML mapping keys that are illegal unquoted (`*` is an alias indicator). */
function yamlKey(key: string): string {
  if (key === "*" || /[:#\n"'&*!|>%@`{}[\],?]/.test(key) || /^\s|\s$/.test(key)) {
    return JSON.stringify(key);
  }
  return key;
}

function serializeYamlLines(value: unknown, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) {
    return [`${pad}null`];
  }
  if (typeof value === "string") {
    return [`${pad}${yamlScalar(value)}`];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "object" && item !== null) {
        return [`${pad}-`, ...serializeYamlLines(item, indent + 1)];
      }
      return [`${pad}- ${yamlScalar(String(item))}`];
    });
  }
  if (typeof value === "object") {
    const lines: string[] = [];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = yamlKey(key);
      if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else if (Array.isArray(nested)) {
        lines.push(`${pad}${safeKey}:`);
        lines.push(...serializeYamlLines(nested, indent + 1));
      } else {
        lines.push(`${pad}${safeKey}: ${serializeYamlLines(nested, 0)[0]?.trim() ?? "null"}`);
      }
    }
    return lines;
  }
  return [`${pad}${String(value)}`];
}

function serializeFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`${key}:`);
      lines.push(...serializeYamlLines(value, 1));
    } else {
      lines.push(`${key}: ${serializeYamlLines(value, 0)[0]?.trim() ?? "null"}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export interface AllowedExpertRef {
  id: string;
  name: string;
  description: string;
}

/** Appended at sync time — open built-ins + orchestrator allowlist experts. */
export function appendSubagentRosterSection(
  body: string,
  allowedExperts: AllowedExpertRef[],
): string {
  const trimmed = body.trim();
  const roster = buildSubagentRosterMarkdown(allowedExperts);
  return [trimmed, "", "---", roster].join("\n");
}

function resolveAllowedExpertIds(
  orchestrator: OrchestratorDefinition,
  enabledExpertIds: string[],
): string[] {
  const enabled = new Set(enabledExpertIds);
  if (orchestrator.allowedExperts !== undefined) {
    return orchestrator.allowedExperts.filter((id) => enabled.has(id));
  }
  return enabledExpertIds;
}

/** Drop stale / disabled expert ids from a stored allowlist for UI + persistence. */
export function pruneAllowedExpertIds(
  allowedExperts: string[] | undefined,
  knownExpertIds: string[],
): string[] | undefined {
  if (allowedExperts === undefined) return undefined;
  const known = new Set(knownExpertIds);
  return allowedExperts.filter((id) => known.has(id));
}

function mergePermissions(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (
      key in merged
      && typeof merged[key] === "object"
      && merged[key] !== null
      && !Array.isArray(merged[key])
      && typeof value === "object"
      && value !== null
      && !Array.isArray(value)
    ) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function orchestratorContentHash(md: string): string {
  let hash = 5381;
  for (let i = 0; i < md.length; i++) {
    hash = ((hash << 5) + hash) + md.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export interface ProjectExpertsAgentEntry {
  filename: string;
  content: string;
}

export interface ProjectExpertsAgentPlan {
  agentEntries: ProjectExpertsAgentEntry[];
  agentFiles: string[];
  orchestratorId: string;
  orchestratorContentHash: string;
  syncContentHash: string;
}

function computeSyncContentHash(entries: ProjectExpertsAgentEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.filename.localeCompare(b.filename));
  const payload = sorted.map((e) => `${e.filename}\0${e.content}`).join("\x1e");
  return orchestratorContentHash(payload);
}

/** Build agent.md payloads without writing — used to skip redundant sync on chat send. */
export function buildProjectExpertsAgentPlan(
  projectRoot: string,
  options?: { promptCtx?: PromptContext; defaultSubagentModel?: string | null },
): ProjectExpertsAgentPlan {
  const promptCtx: PromptContext = { projectRoot, ...options?.promptCtx };
  let defaultSubagentModel = options?.defaultSubagentModel ?? null;
  if (options?.defaultSubagentModel === undefined) {
    // Lazy require — keep module importable in unit tests without electron-store.
    try {
      const { getSettings } = require("./settings") as typeof import("./settings");
      defaultSubagentModel =
        (getSettings() as { aiSubagentModel?: string | null }).aiSubagentModel ?? null;
    } catch {
      defaultSubagentModel = null;
    }
  }

  const orchestratorId = resolveOrchestratorId(projectRoot, null);
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator?.enabled) {
    throw new Error(`Orchestrator not found or disabled: ${orchestratorId}`);
  }

  const enabledExperts = listExperts(projectRoot).filter((e) => e.enabled);
  const enabledExpertIds = enabledExperts.map((e) => e.id);
  const allowedExpertIds = resolveAllowedExpertIds(orchestrator, enabledExpertIds);
  const allowedExpertRefs = allowedExpertIds
    .map((id) => enabledExperts.find((e) => e.id === id))
    .filter((e): e is ExpertInfo => !!e)
    .map((e) => ({ id: e.id, name: e.name, description: e.description }));

  const agentEntries: ProjectExpertsAgentEntry[] = [];

  for (const expert of enabledExperts) {
    const instructions = readExpertInstructions(projectRoot, expert);
    agentEntries.push({
      filename: `${expert.id}.md`,
      content: renderExpertAgentMarkdown(expert, instructions, promptCtx, {
        defaultModel: defaultSubagentModel,
      }),
    });
  }

  const orchestratorInstructions = readOrchestratorInstructions(projectRoot, orchestrator);
  const orchestratorMd = renderOrchestratorAgentMarkdown(
    orchestrator,
    orchestratorInstructions,
    allowedExpertRefs,
    promptCtx,
  );
  agentEntries.push({
    filename: `${orchestrator.id}.md`,
    content: orchestratorMd,
  });

  for (const extra of listOrchestrators(projectRoot).filter(
    (o) => o.enabled && o.id !== orchestratorId,
  )) {
    const extraAllowed = resolveAllowedExpertIds(extra, enabledExpertIds);
    const extraAllowedRefs = extraAllowed
      .map((id) => enabledExperts.find((e) => e.id === id))
      .filter((e): e is ExpertInfo => !!e)
      .map((e) => ({ id: e.id, name: e.name, description: e.description }));
    const extraInstructions = readOrchestratorInstructions(projectRoot, extra);
    agentEntries.push({
      filename: `${extra.id}.md`,
      content: renderOrchestratorAgentMarkdown(extra, extraInstructions, extraAllowedRefs, promptCtx),
    });
  }

  return {
    agentEntries,
    agentFiles: agentEntries.map((e) => e.filename),
    orchestratorId,
    orchestratorContentHash: orchestratorContentHash(orchestratorMd),
    syncContentHash: computeSyncContentHash(agentEntries),
  };
}

export function renderExpertAgentMarkdown(
  def: ExpertDefinition,
  instructionsBody: string,
  promptCtx: PromptContext = {},
  options?: { defaultModel?: string | null },
): string {
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "subagent",
  };
  const model =
    (typeof def.model === "string" && def.model.trim())
    || (typeof options?.defaultModel === "string" && options.defaultModel.trim())
    || "";
  if (model) frontmatter.model = model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  // Platform rule: subagents never nest Task — authors only write domain work.
  frontmatter.permission = mergePermissions(def.permission, {
    task: { "*": "deny" },
  });
  const body = appendCapabilityRefs(def, instructionsBody, promptCtx, "expert");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

export function renderOrchestratorAgentMarkdown(
  def: OrchestratorDefinition,
  instructionsBody: string,
  allowedExperts: AllowedExpertRef[],
  promptCtx: PromptContext = {},
): string {
  const taskRules = buildTaskPermissionBlock(allowedExperts.map((e) => e.id));
  const permission = mergePermissions(def.permission, { task: taskRules });
  const frontmatter: Record<string, unknown> = {
    description: def.description,
    mode: "primary",
    permission,
  };
  if (def.model) frontmatter.model = def.model;
  if (def.temperature !== undefined) frontmatter.temperature = def.temperature;
  const bodyWithExperts = appendSubagentRosterSection(instructionsBody, allowedExperts);
  const body = appendCapabilityRefs(def, bodyWithExperts, promptCtx, "orchestrator");
  return `${serializeFrontmatter(frontmatter)}\n\n${body}\n`;
}

export function getOpencodeAgentsDir(): string {
  return join(app.getPath("userData"), "opencode-server", "config", "opencode", "agents");
}

export function getPrismExpertsSyncStatePath(): string {
  return join(app.getPath("userData"), "opencode-server", PRISM_EXPERTS_SYNC_REL);
}

export function readPrismExpertsSyncState(): PrismExpertsSyncState | null {
  const path = getPrismExpertsSyncStatePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PrismExpertsSyncState;
  } catch {
    return null;
  }
}

export function writePrismExpertsSyncState(state: PrismExpertsSyncState): void {
  const path = getPrismExpertsSyncStatePath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

export function clearSyncedAgentFiles(agentsDir: string, agentFiles: string[]): void {
  for (const file of agentFiles) {
    const safe = file.replace(/[/\\]/g, "");
    if (!safe || safe !== file) continue;
    const target = join(agentsDir, safe);
    if (existsSync(target)) {
      try {
        unlinkSync(target);
      } catch {
        // non-fatal
      }
    }
  }
}

export function syncProjectExpertsToOpencode(
  projectRoot: string,
  options?: {
    agentsDir?: string;
    syncStatePath?: string;
    promptCtx?: PromptContext;
    defaultSubagentModel?: string | null;
  },
): { agentFiles: string[]; orchestratorId: string; orchestratorContentHash: string; syncContentHash: string } {
  const agentsDir = options?.agentsDir ?? getOpencodeAgentsDir();
  mkdirSync(agentsDir, { recursive: true });

  const plan = buildProjectExpertsAgentPlan(projectRoot, options);
  for (const entry of plan.agentEntries) {
    writeFileSync(join(agentsDir, entry.filename), entry.content, "utf-8");
  }

  const state: PrismExpertsSyncState = {
    projectRoot,
    syncedAt: Date.now(),
    agentFiles: plan.agentFiles,
    orchestratorId: plan.orchestratorId,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
  };

  if (options?.syncStatePath) {
    mkdirSync(join(options.syncStatePath, ".."), { recursive: true });
    writeFileSync(options.syncStatePath, JSON.stringify(state, null, 2), "utf-8");
  } else {
    writePrismExpertsSyncState(state);
  }

  return {
    agentFiles: plan.agentFiles,
    orchestratorId: plan.orchestratorId,
    orchestratorContentHash: plan.orchestratorContentHash,
    syncContentHash: plan.syncContentHash,
  };
}

function slugifyId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "custom-expert";
}

function uniqueCustomExpertId(projectRoot: string, base: string): string {
  const existing = new Set(listCustomExpertDefinitions(projectRoot).map((e) => e.id));
  for (const bundled of listBundledExpertDefinitions()) {
    existing.add(bundled.id);
  }
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function saveCustomExpert(
  projectRoot: string,
  payload: SaveCustomExpertPayload,
): ExpertInfo {
  const baseId = payload.id?.trim() || slugifyId(payload.name);
  const id = payload.id ? baseId : uniqueCustomExpertId(projectRoot, baseId);
  const dir = join(projectRoot, CUSTOM_EXPERTS_REL, id);
  mkdirSync(dir, { recursive: true });

  const def: ExpertDefinition = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    builtin: false,
    removable: true,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    modules: payload.modules?.length ? payload.modules : undefined,
    permission: payload.permission,
  };

  writeFileSync(join(dir, "expert.json"), JSON.stringify(def, null, 2), "utf-8");
  writeFileSync(join(dir, "instructions.md"), payload.instructions.trim(), "utf-8");

  const saved = getExpert(projectRoot, id);
  if (!saved) throw new Error(`Failed to save custom expert "${id}"`);
  return saved;
}

export function deleteCustomExpert(projectRoot: string, expertId: string): void {
  const expert = getExpert(projectRoot, expertId);
  if (!expert) throw new Error(`Expert not found: ${expertId}`);
  if (expert.builtin) throw new Error(`Cannot delete built-in expert: ${expertId}`);
  const dir = join(projectRoot, CUSTOM_EXPERTS_REL, expertId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

function uniqueCustomOrchestratorId(projectRoot: string, base: string): string {
  const existing = new Set(listCustomOrchestratorDefinitions(projectRoot).map((o) => o.id));
  for (const bundled of listBundledOrchestratorDefinitions()) {
    existing.add(bundled.id);
  }
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function saveCustomOrchestrator(
  projectRoot: string,
  payload: SaveCustomOrchestratorPayload,
): OrchestratorInfo {
  const baseId = payload.id?.trim() || slugifyId(payload.name);
  const id = payload.id ? baseId : uniqueCustomOrchestratorId(projectRoot, baseId);
  const dir = join(projectRoot, CUSTOM_ORCHESTRATORS_REL, id);
  mkdirSync(dir, { recursive: true });

  const enabledExpertIds = listExperts(projectRoot).filter((e) => e.enabled).map((e) => e.id);
  const knownExpertIds = listExperts(projectRoot).map((e) => e.id);
  const def: OrchestratorDefinition = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    builtin: false,
    removable: true,
    allowedExperts:
      payload.allowedExperts !== undefined
        ? pruneAllowedExpertIds(payload.allowedExperts, knownExpertIds) ?? []
        : enabledExpertIds,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
    temperature: payload.temperature,
    permission: payload.permission,
  };

  writeFileSync(join(dir, "orchestrator.json"), JSON.stringify(def, null, 2), "utf-8");
  writeFileSync(join(dir, "instructions.md"), payload.instructions.trim(), "utf-8");

  const saved = getOrchestrator(projectRoot, id);
  if (!saved) throw new Error(`Failed to save custom orchestrator "${id}"`);
  return saved;
}

export function deleteCustomOrchestrator(projectRoot: string, orchestratorId: string): void {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) throw new Error(`Orchestrator not found: ${orchestratorId}`);
  if (orchestrator.builtin) throw new Error(`Cannot delete built-in orchestrator: ${orchestratorId}`);
  const dir = join(projectRoot, CUSTOM_ORCHESTRATORS_REL, orchestratorId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  const manifest = readOrchestratorsManifest(projectRoot);
  if (manifest.defaultOrchestratorId === orchestratorId) {
    writeOrchestratorsManifest(projectRoot, {
      ...manifest,
      defaultOrchestratorId: DEFAULT_ORCHESTRATOR_ID,
    });
  }
}

export function getOrchestratorDetail(
  projectRoot: string,
  orchestratorId: string,
): (OrchestratorInfo & { instructions: string }) | null {
  const orchestrator = getOrchestrator(projectRoot, orchestratorId);
  if (!orchestrator) return null;
  return {
    ...orchestrator,
    instructions: readOrchestratorInstructions(projectRoot, orchestrator),
  };
}

export function setBuiltinExpertEnabled(
  projectRoot: string,
  expertId: string,
  enabled: boolean,
): void {
  const bundled = listBundledExpertDefinitions().find((e) => e.id === expertId);
  if (!bundled) throw new Error(`Built-in expert not found: ${expertId}`);
  const manifest = readExpertsManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  if (enabled) disabled.delete(expertId);
  else disabled.add(expertId);
  writeExpertsManifest(projectRoot, {
    ...manifest,
    disabledBuiltinIds: [...disabled],
  });
}

export function saveBuiltinExpertOverride(
  projectRoot: string,
  payload: SaveBuiltinExpertOverridePayload,
): ExpertInfo {
  const bundled = listBundledExpertDefinitions().find((e) => e.id === payload.expertId);
  if (!bundled) throw new Error(`Built-in expert not found: ${payload.expertId}`);
  const manifest = readExpertsManifest(projectRoot);
  const override: Partial<ExpertDefinition> = {};
  if (payload.model !== undefined) override.model = payload.model;
  if (payload.thoughtLevel !== undefined) override.thoughtLevel = payload.thoughtLevel;
  if (payload.temperature !== undefined) override.temperature = payload.temperature;
  if (payload.permission !== undefined) override.permission = payload.permission;

  const hasOverride = Object.keys(override).length > 0;
  const nextOverrides = { ...(manifest.builtinOverrides ?? {}) };
  if (hasOverride) nextOverrides[payload.expertId] = override;
  else delete nextOverrides[payload.expertId];

  writeExpertsManifest(projectRoot, {
    ...manifest,
    builtinOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
  });

  const saved = getExpert(projectRoot, payload.expertId);
  if (!saved) throw new Error(`Failed to save built-in expert override "${payload.expertId}"`);
  return saved;
}

export function setDefaultOrchestrator(projectRoot: string, orchestratorId: string): void {
  const found = getOrchestrator(projectRoot, orchestratorId);
  if (!found?.enabled) throw new Error(`Orchestrator not found or disabled: ${orchestratorId}`);
  const manifest = readOrchestratorsManifest(projectRoot);
  writeOrchestratorsManifest(projectRoot, {
    ...manifest,
    defaultOrchestratorId: orchestratorId,
  });
}

export function saveBuiltinOrchestratorOverride(
  projectRoot: string,
  payload: SaveBuiltinOrchestratorOverridePayload,
): OrchestratorInfo {
  const bundled = listBundledOrchestratorDefinitions().find((o) => o.id === payload.orchestratorId);
  if (!bundled) throw new Error(`Built-in orchestrator not found: ${payload.orchestratorId}`);
  const manifest = readOrchestratorsManifest(projectRoot);
  const knownExpertIds = listExperts(projectRoot).map((e) => e.id);
  const override: Partial<OrchestratorDefinition> = {};
  if (payload.allowedExperts !== undefined) {
    override.allowedExperts = pruneAllowedExpertIds(payload.allowedExperts, knownExpertIds) ?? [];
  }
  if (payload.model !== undefined) override.model = payload.model;
  if (payload.thoughtLevel !== undefined) override.thoughtLevel = payload.thoughtLevel;
  if (payload.temperature !== undefined) override.temperature = payload.temperature;
  if (payload.permission !== undefined) override.permission = payload.permission;

  const hasOverride = Object.keys(override).length > 0;
  const nextOverrides = { ...(manifest.builtinOverrides ?? {}) };
  if (hasOverride) nextOverrides[payload.orchestratorId] = override;
  else delete nextOverrides[payload.orchestratorId];

  writeOrchestratorsManifest(projectRoot, {
    ...manifest,
    builtinOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
  });

  const saved = getOrchestrator(projectRoot, payload.orchestratorId);
  if (!saved) {
    throw new Error(`Failed to save built-in orchestrator override "${payload.orchestratorId}"`);
  }
  return saved;
}

export function getExpertDetail(
  projectRoot: string,
  expertId: string,
): (ExpertInfo & { instructions: string }) | null {
  const expert = getExpert(projectRoot, expertId);
  if (!expert) return null;
  return {
    ...expert,
    instructions: readExpertInstructions(projectRoot, expert),
  };
}

export function listDisabledBuiltinExperts(projectRoot: string): ExpertInfo[] {
  const manifest = readExpertsManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  return listBundledExpertDefinitions()
    .filter((e) => disabled.has(e.id))
    .map((e) => {
      const instructions = readBundledExpertInstructions(e.id)?.trim() || "";
      const overridden = applyExpertOverride({ ...e, builtin: true, removable: false }, manifest.builtinOverrides?.[e.id]);
      return {
        ...overridden,
        enabled: false,
        instructionsPreview: instructionsPreview(instructions),
        effectiveModules: resolveActiveModuleKeys({
          role: "expert",
          profileModules: resolveExpertProfileModuleKeysFor(overridden),
        }),
      };
    });
}

export function resetBuiltinExpertOverride(
  projectRoot: string,
  expertId: string,
): ExpertInfo {
  const bundled = listBundledExpertDefinitions().find((e) => e.id === expertId);
  if (!bundled) throw new Error(`Built-in expert not found: ${expertId}`);
  const manifest = readExpertsManifest(projectRoot);
  const nextOverrides = { ...(manifest.builtinOverrides ?? {}) };
  delete nextOverrides[expertId];
  writeExpertsManifest(projectRoot, {
    ...manifest,
    builtinOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
  });
  const saved = getExpert(projectRoot, expertId);
  if (!saved) throw new Error(`Built-in expert not found: ${expertId}`);
  return saved;
}

export function resetAllBuiltinExpertsToDefaults(projectRoot: string): ExpertsManifest {
  const manifest = readExpertsManifest(projectRoot);
  const next: ExpertsManifest = {
    disabledBuiltinIds: [],
    builtinOverrides: undefined,
  };
  writeExpertsManifest(projectRoot, next);
  return next;
}

export function expertsManifestModified(manifest: ExpertsManifest): boolean {
  if ((manifest.disabledBuiltinIds?.length ?? 0) > 0) return true;
  if (manifest.builtinOverrides && Object.keys(manifest.builtinOverrides).length > 0) return true;
  return false;
}

export function resetBuiltinOrchestratorOverride(
  projectRoot: string,
  orchestratorId: string,
): OrchestratorInfo {
  const bundled = listBundledOrchestratorDefinitions().find((o) => o.id === orchestratorId);
  if (!bundled) throw new Error(`Built-in orchestrator not found: ${orchestratorId}`);
  const manifest = readOrchestratorsManifest(projectRoot);
  const nextOverrides = { ...(manifest.builtinOverrides ?? {}) };
  delete nextOverrides[orchestratorId];
  writeOrchestratorsManifest(projectRoot, {
    ...manifest,
    builtinOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
  });
  const saved = getOrchestrator(projectRoot, orchestratorId);
  if (!saved) throw new Error(`Built-in orchestrator not found: ${orchestratorId}`);
  return saved;
}
