import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type AgentProfileDefinition,
  type AgentProfileInfo,
  type ProfileEditorOptions,
  type ProfileRuntimeFilters,
  type ProfilesManifest,
  type SaveBuiltinProfileOverridePayload,
  type SaveCustomProfilePayload,
  type BuiltinProfileOverride,
} from "./agent-profiles";
import {
  listBundledProfileDefinitions,
  readBundledProfileInstructions,
  readBundledProfileDefinition,
} from "./bundled-profiles";
import { listProjectSkills } from "./skills-sync";
import { listProjectRules } from "./rules-sync";
import { ALL_MODULES } from "../prompts/modules";
import { resolveActiveModuleKeys } from "../prompts/resolve-active-modules";
import { commandRegistry } from "../commands/registry";

export const PROFILES_MANIFEST_REL = ".prismnext/agent/profiles-manifest.json";
export const CUSTOM_PROFILES_REL = ".prismnext/agent/profiles/custom";

function defaultManifest(): ProfilesManifest {
  return { disabledBuiltinIds: [] };
}

export function readProfilesManifest(projectRoot: string): ProfilesManifest {
  const path = join(projectRoot, PROFILES_MANIFEST_REL);
  if (!existsSync(path)) return defaultManifest();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ProfilesManifest;
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
    return defaultManifest();
  }
}

export function writeProfilesManifest(projectRoot: string, manifest: ProfilesManifest): void {
  const path = join(projectRoot, PROFILES_MANIFEST_REL);
  mkdirSync(join(projectRoot, ".prismnext", "agent"), { recursive: true });
  const normalized: ProfilesManifest = {
    disabledBuiltinIds: manifest.disabledBuiltinIds ?? [],
    builtinOverrides: manifest.builtinOverrides,
  };
  writeFileSync(path, JSON.stringify(normalized, null, 2), "utf-8");
}

function listCustomProfileDefinitions(projectRoot: string): AgentProfileDefinition[] {
  const root = join(projectRoot, CUSTOM_PROFILES_REL);
  if (!existsSync(root)) return [];
  const profiles: AgentProfileDefinition[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const profilePath = join(root, entry.name, "profile.json");
    if (!existsSync(profilePath)) continue;
    try {
      const def = JSON.parse(readFileSync(profilePath, "utf-8")) as AgentProfileDefinition;
      profiles.push({
        ...def,
        id: def.id || entry.name,
        builtin: false,
        removable: true,
      });
    } catch {
      // skip invalid
    }
  }
  return profiles;
}

export function readProfileInstructions(
  projectRoot: string,
  profile: AgentProfileDefinition,
): string {
  if (profile.builtin) {
    return readBundledProfileInstructions(profile.id)?.trim() || "";
  }
  const customPath = join(projectRoot, CUSTOM_PROFILES_REL, profile.id, "instructions.md");
  if (existsSync(customPath)) {
    return readFileSync(customPath, "utf-8").trim();
  }
  return "";
}

function instructionsPreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function applyBuiltinOverride(
  profile: AgentProfileDefinition,
  override?: BuiltinProfileOverride,
): AgentProfileDefinition {
  if (!override) return profile;
  return {
    ...profile,
    skills: override.skills !== undefined
      ? override.skills.length ? override.skills : undefined
      : profile.skills,
    mcpServers: override.mcpServers !== undefined
      ? override.mcpServers.length ? override.mcpServers : undefined
      : profile.mcpServers,
    modules: override.modules !== undefined
      ? override.modules.length ? override.modules : undefined
      : profile.modules,
    rules: override.rules !== undefined
      ? override.rules.length ? override.rules : undefined
      : profile.rules,
    model: override.model !== undefined ? override.model || undefined : profile.model,
    thoughtLevel: override.thoughtLevel !== undefined
      ? override.thoughtLevel || undefined
      : profile.thoughtLevel,
  };
}

function mergeDefinitions(projectRoot: string): AgentProfileDefinition[] {
  const manifest = readProfilesManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  const bundled = listBundledProfileDefinitions()
    .filter((p) => !disabled.has(p.id))
    .map((p) =>
      applyBuiltinOverride(
        { ...p, builtin: true, removable: false },
        manifest.builtinOverrides?.[p.id],
      ),
    );
  const custom = listCustomProfileDefinitions(projectRoot);
  const byId = new Map<string, AgentProfileDefinition>();
  for (const p of [...bundled, ...custom]) {
    byId.set(p.id, p);
  }
  return Array.from(byId.values());
}

export function listAgentProfiles(projectRoot: string): AgentProfileInfo[] {
  return mergeDefinitions(projectRoot).map((profile) => {
    const instructions = readProfileInstructions(projectRoot, profile);
    const manifest = readProfilesManifest(projectRoot);
    const disabled = new Set(manifest.disabledBuiltinIds ?? []);
    const effectiveModules = resolveActiveModuleKeys({ profileModules: profile.modules });
    return {
      ...profile,
      enabled: profile.builtin ? !disabled.has(profile.id) : true,
      instructionsPreview: instructionsPreview(instructions),
      effectiveModules,
    };
  });
}

export function getAgentProfile(
  projectRoot: string,
  profileId: string,
): AgentProfileInfo | null {
  return listAgentProfiles(projectRoot).find((p) => p.id === profileId) ?? null;
}

/** Resolve an explicitly selected profile id. Returns null when none was chosen. */
export function resolveProfileId(
  projectRoot: string,
  tabProfileId?: string | null,
): string | null {
  if (!tabProfileId) return null;
  const found = getAgentProfile(projectRoot, tabProfileId);
  return found?.enabled ? found.id : null;
}

/** @deprecated use resolveProfileId */
export const resolveMainProfileId = resolveProfileId;

export function getProfileRuntimeFilters(
  projectRoot: string,
  profileId: string,
): ProfileRuntimeFilters | null {
  const profile = getAgentProfile(projectRoot, profileId);
  if (!profile?.enabled) return null;
  const filters: ProfileRuntimeFilters = {};
  if (profile.modules?.length) filters.modules = profile.modules;
  if (profile.skills?.length) filters.skills = profile.skills;
  if (profile.mcpServers?.length) filters.mcpServers = profile.mcpServers;
  if (profile.commands?.length) filters.commands = profile.commands;
  if (profile.rules?.length) filters.rules = profile.rules;
  return filters;
}

export function buildProfilePromptOverlay(
  projectRoot: string,
  profileId: string,
): { profileId: string; profileName: string; profileInstructions: string } | null {
  const profile = getAgentProfile(projectRoot, profileId);
  if (!profile || !profile.enabled) return null;

  const body = readProfileInstructions(projectRoot, profile);
  if (!body) return null;

  const refs: string[] = [];
  if (profile.skills?.length) refs.push(`Enabled skills: ${profile.skills.join(", ")}`);
  if (profile.mcpServers?.length) refs.push(`Enabled MCP servers: ${profile.mcpServers.join(", ")}`);
  if (profile.modules?.length) {
    const effective = resolveActiveModuleKeys({ profileModules: profile.modules });
    if (effective.length) refs.push(`Knowledge modules: ${effective.join(", ")}`);
  }
  if (profile.rules?.length) refs.push(`Active rules: ${profile.rules.join(", ")}`);

  const instructions = refs.length
    ? `${body}\n\n---\n${refs.join("\n")}`
    : body;

  return {
    profileId: profile.id,
    profileName: profile.name,
    profileInstructions: instructions,
  };
}

function slugifyId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "custom-profile";
}

function uniqueCustomId(projectRoot: string, base: string): string {
  const existing = new Set(listCustomProfileDefinitions(projectRoot).map((p) => p.id));
  for (const bundled of listBundledProfileDefinitions()) {
    existing.add(bundled.id);
  }
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function getProfileDetail(
  projectRoot: string,
  profileId: string,
): (AgentProfileInfo & { instructions: string }) | null {
  const profile = getAgentProfile(projectRoot, profileId);
  if (!profile) return null;
  return {
    ...profile,
    instructions: readProfileInstructions(projectRoot, profile),
  };
}

export function saveCustomProfile(
  projectRoot: string,
  payload: SaveCustomProfilePayload,
): AgentProfileInfo {
  const baseId = payload.id?.trim() || slugifyId(payload.name);
  const id = payload.id ? baseId : uniqueCustomId(projectRoot, baseId);
  const dir = join(projectRoot, CUSTOM_PROFILES_REL, id);
  mkdirSync(dir, { recursive: true });

  const def: AgentProfileDefinition = {
    id,
    name: payload.name.trim(),
    description: payload.description.trim(),
    builtin: false,
    removable: true,
    skills: payload.skills?.length ? payload.skills : undefined,
    mcpServers: payload.mcpServers?.length ? payload.mcpServers : undefined,
    modules: payload.modules?.length ? payload.modules : undefined,
    rules: payload.rules?.length ? payload.rules : undefined,
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
  };

  writeFileSync(join(dir, "profile.json"), JSON.stringify(def, null, 2), "utf-8");
  writeFileSync(join(dir, "instructions.md"), payload.instructions.trim() + "\n", "utf-8");

  const saved = getAgentProfile(projectRoot, id);
  if (!saved) throw new Error(`Failed to save profile "${id}"`);
  return saved;
}

function optionalStringList(values?: string[]): string[] | undefined {
  return values?.length ? values : undefined;
}

export function saveBuiltinProfileOverride(
  projectRoot: string,
  payload: SaveBuiltinProfileOverridePayload,
): AgentProfileInfo {
  const bundled = readBundledProfileDefinition(payload.profileId);
  if (!bundled) throw new Error(`Built-in profile not found: ${payload.profileId}`);

  const manifest = readProfilesManifest(projectRoot);
  const override: BuiltinProfileOverride = {
    skills: optionalStringList(payload.skills),
    mcpServers: optionalStringList(payload.mcpServers),
    modules: optionalStringList(payload.modules),
    rules: optionalStringList(payload.rules),
    model: payload.model?.trim() || undefined,
    thoughtLevel: payload.thoughtLevel?.trim() || undefined,
  };

  const hasOverride = Object.values(override).some((v) => v !== undefined);
  const nextOverrides = { ...(manifest.builtinOverrides ?? {}) };
  if (hasOverride) nextOverrides[payload.profileId] = override;
  else delete nextOverrides[payload.profileId];

  manifest.builtinOverrides = Object.keys(nextOverrides).length ? nextOverrides : undefined;
  writeProfilesManifest(projectRoot, manifest);

  const saved = getAgentProfile(projectRoot, payload.profileId);
  if (!saved) throw new Error(`Failed to save built-in profile override "${payload.profileId}"`);
  return saved;
}

export function resetBuiltinProfileOverride(
  projectRoot: string,
  profileId: string,
): AgentProfileInfo {
  const bundled = readBundledProfileDefinition(profileId);
  if (!bundled) throw new Error(`Built-in profile not found: ${profileId}`);

  const manifest = readProfilesManifest(projectRoot);
  if (manifest.builtinOverrides?.[profileId]) {
    const nextOverrides = { ...manifest.builtinOverrides };
    delete nextOverrides[profileId];
    manifest.builtinOverrides = Object.keys(nextOverrides).length ? nextOverrides : undefined;
    writeProfilesManifest(projectRoot, manifest);
  }

  const saved = getAgentProfile(projectRoot, profileId);
  if (!saved) throw new Error(`Built-in profile not found: ${profileId}`);
  return saved;
}

export function deleteCustomProfile(projectRoot: string, profileId: string): void {
  const profile = getAgentProfile(projectRoot, profileId);
  if (!profile) throw new Error(`Profile not found: ${profileId}`);
  if (profile.builtin) throw new Error(`Built-in profile cannot be deleted: ${profileId}`);

  const dir = join(projectRoot, CUSTOM_PROFILES_REL, profileId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function getProfileEditorOptions(projectRoot: string): ProfileEditorOptions {
  commandRegistry.setProjectRoot(projectRoot);
  commandRegistry.reload();

  const skills = listProjectSkills(projectRoot).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    enabled: s.enabled,
  }));

  const mcpServers: Array<{ name: string }> = [];
  const mcpPath = join(projectRoot, ".prismnext", "agent", "mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const raw = JSON.parse(readFileSync(mcpPath, "utf-8")) as {
        mcpServers?: Record<string, unknown>;
      };
      if (raw.mcpServers && typeof raw.mcpServers === "object") {
        for (const name of Object.keys(raw.mcpServers)) {
          mcpServers.push({ name });
        }
      }
    } catch {
      // ignore
    }
  }

  const modules = ALL_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    globallyEnabled: m.enabled,
  }));

  const commands = commandRegistry.list().map((c) => ({
    name: c.name,
    description: c.description,
    enabled: c.enabled,
  }));

  const rules: Array<{ name: string }> = [];
  for (const rule of listProjectRules(projectRoot)) {
    if (rule.enabled && rule.name.trim()) {
      rules.push({ name: rule.name.trim() });
    }
  }

  return { skills, mcpServers, modules, commands, rules };
}

export function setBuiltinProfileEnabled(
  projectRoot: string,
  profileId: string,
  enabled: boolean,
): ProfilesManifest {
  const bundled = readBundledProfileDefinition(profileId);
  if (!bundled) throw new Error(`Built-in profile not found: ${profileId}`);
  const manifest = readProfilesManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  if (enabled) disabled.delete(profileId);
  else disabled.add(profileId);
  manifest.disabledBuiltinIds = Array.from(disabled);
  writeProfilesManifest(projectRoot, manifest);
  return manifest;
}

/** Built-in profiles removed for this project (reappear after section reset). */
export function listDisabledBuiltinProfiles(projectRoot: string): AgentProfileInfo[] {
  const manifest = readProfilesManifest(projectRoot);
  const disabled = new Set(manifest.disabledBuiltinIds ?? []);
  if (disabled.size === 0) return [];

  return listBundledProfileDefinitions()
    .filter((p) => disabled.has(p.id))
    .map((profile) => {
      const def = applyBuiltinOverride(
        { ...profile, builtin: true, removable: false },
        manifest.builtinOverrides?.[profile.id],
      );
      const instructions = readProfileInstructions(projectRoot, def);
      return {
        ...def,
        enabled: false,
        instructionsPreview: instructionsPreview(instructions),
        effectiveModules: resolveActiveModuleKeys({ profileModules: def.modules }),
      };
    });
}

export function builtinsDifferFromDefaults(projectRoot: string): boolean {
  const manifest = readProfilesManifest(projectRoot);
  if ((manifest.disabledBuiltinIds?.length ?? 0) > 0) return true;
  if (manifest.builtinOverrides && Object.keys(manifest.builtinOverrides).length > 0) return true;
  return false;
}

/** Restore all built-in presets to app defaults. Custom profiles are untouched. */
export function resetAllBuiltinProfilesToDefaults(projectRoot: string): ProfilesManifest {
  const manifest = readProfilesManifest(projectRoot);
  manifest.disabledBuiltinIds = [];
  manifest.builtinOverrides = undefined;
  writeProfilesManifest(projectRoot, manifest);
  return manifest;
}

/** Re-enable built-in profiles (all, or specific ids). */
export function restoreBuiltinProfiles(
  projectRoot: string,
  profileIds?: string[],
): ProfilesManifest {
  const manifest = readProfilesManifest(projectRoot);
  if (!profileIds?.length) {
    manifest.disabledBuiltinIds = [];
  } else {
    const disabled = new Set(manifest.disabledBuiltinIds ?? []);
    for (const id of profileIds) {
      if (readBundledProfileDefinition(id)) disabled.delete(id);
    }
    manifest.disabledBuiltinIds = Array.from(disabled);
  }
  writeProfilesManifest(projectRoot, manifest);
  return manifest;
}
