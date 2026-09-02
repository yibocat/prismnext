import { ipcMain } from "electron";
import { getSettings, updateSettings } from "../app/settings";
import { parseRemoteAbs } from "../../shared/remote";
import { getRemoteSessionBroker } from "./remote";
import { projectLifecycleAuthority } from "../project/project-lifecycle-authority";

const PERMISSION_SETTING_KEYS = [
  "toolAllowAlways",
  "bashAllowAlwaysPatterns",
  "permissionAllowedPaths",
  "permissionAllowRules",
  "permissionDenyRules",
  "permissionMode",
] as const;

function pickPermissionPatch(input: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let hit = false;
  for (const key of PERMISSION_SETTING_KEYS) {
    if (!(key in input)) continue;
    hit = true;
    out[key] = input[key];
  }
  return hit ? out : null;
}
import { promptManager, CORE_PERSONA_PROMPT, buildPromptContext, buildPromptStackPreview, formatPromptStackPreviewMarkdown } from "../prompts";
import { countPromptTokens } from "../lib/token-estimate";
import { PROMPT_TOKEN_ENCODING } from "../../shared/providers/token-estimate";
import { refreshApplicationMenu } from "../menu";
import { syncTrayFromSettings } from "../app/tray";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", async () => {
    const local = getSettings();
    const root = projectLifecycleAuthority.currentRoot;
    const parsed = root ? parseRemoteAbs(root) : null;
    if (!parsed) return local;
    const broker = getRemoteSessionBroker();
    if (!broker.isBound(parsed.profileId)) return local;
    try {
      const remote = await broker.invoke(parsed.profileId, "settings:getRemotePermissions", {}) as Record<string, unknown>;
      return { ...local, ...remote, permissionsStoredOn: "server" };
    } catch {
      return local;
    }
  });

  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      const permissionPatch = pickPermissionPatch(patch);
      const root = projectLifecycleAuthority.currentRoot;
      const parsed = root ? parseRemoteAbs(root) : null;
      if (permissionPatch && parsed) {
        const broker = getRemoteSessionBroker();
        if (broker.isBound(parsed.profileId)) {
          await broker.invoke(parsed.profileId, "settings:setRemotePermissions", permissionPatch);
        }
      }
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
      if ("aiApiKeys" in patch || "aiBaseUrls" in patch) {
        void getRemoteSessionBroker().reconfigureModelKeys().catch(() => undefined);
      }
      // Invalidate prompt cache when user custom prompt changes
      if ("agentSystemPrompt" in patch) {
        promptManager.invalidate();
      }
      if ("appLocale" in patch || "showPromptInternals" in patch) {
        refreshApplicationMenu();
      }
      if ("trayIconEnabled" in patch) {
        syncTrayFromSettings();
      }
      if ("aiSubagentModel" in patch) {
        try {
          const { getWorkbenchState } = await import("../workbench/default-project");
          const lastPath = getWorkbenchState().defaultLastPath?.trim();
          if (lastPath) {
            const { refreshProjectSubagentsIntegration } = await import(
              "../teams/project-subagents-refresh"
            );
            await refreshProjectSubagentsIntegration(lastPath);
          }
        } catch {
          // Tests / missing home — skip disk-less in-memory refresh.
        }
      }
    },
  );

  // ─── Agent Default Prompt ───

  ipcMain.handle(
    "settings:getAssembledPrompt",
    async (_event, args?: { projectRoot?: string; userCustomPrompt?: string }) => {
      const preview = await buildPromptStackPreview({
        projectRoot: args?.projectRoot,
        userCustomPrompt: args?.userCustomPrompt,
      });
      return formatPromptStackPreviewMarkdown(preview);
    },
  );

  ipcMain.handle(
    "settings:getPromptStackPreview",
    async (_event, args?: {
      projectRoot?: string;
      userCustomPrompt?: string;
      sessionTeamId?: string | null;
      orchestratorId?: string | null;
    }) => {
      const preview = await buildPromptStackPreview({
        projectRoot: args?.projectRoot,
        userCustomPrompt: args?.userCustomPrompt,
        sessionTeamId: args?.sessionTeamId,
        orchestratorId: args?.orchestratorId,
      });
      const sections = preview.sections.map((s) => {
        const { tokenCount, charCount } = countPromptTokens(s.content);
        return {
          id: s.id,
          label: s.label,
          injectPath: s.injectPath,
          fileHint: s.fileHint,
          charCount,
          tokenCount,
          content: s.content,
        };
      });
      const totalTokenCount = sections.reduce((sum, s) => sum + s.tokenCount, 0);
      return {
        ...preview,
        markdown: formatPromptStackPreviewMarkdown(preview),
        tokenEncoding: PROMPT_TOKEN_ENCODING,
        totalTokenCount,
        sections,
      };
    },
  );

  ipcMain.handle(
    "settings:countPromptTokens",
    async (_event, args: { text: string }) => {
      return countPromptTokens(args?.text ?? "");
    },
  );

  ipcMain.handle(
    "settings:computePromptFingerprint",
    async (_event, args?: { projectRoot?: string }) => {
      const ctx = await buildPromptContext(args?.projectRoot);
      return promptManager.computePromptFingerprint(ctx);
    },
  );

  // Return the built-in default persona so the renderer can pre-fill
  // the custom prompt editor as a starting point.
  ipcMain.handle("settings:getDefaultPersona", async () => {
    return CORE_PERSONA_PROMPT;
  });

  // ─── Agent Project Config ───

  ipcMain.handle(
    "settings:getAgentProjectConfig",
    async (_event, args: { projectPath: string }) => {
      const { readFileSync, existsSync } = require("node:fs");
      const { join } = require("node:path");
      const settingsPath = join(args.projectPath, ".workbench", "settings.json");
      if (!existsSync(settingsPath)) return { contextComponents: {} };
      try {
        const raw = readFileSync(settingsPath, "utf-8");
        const data = JSON.parse(raw);
        return data.agent || { contextComponents: {} };
      } catch {
        return { contextComponents: {} };
      }
    },
  );

  ipcMain.handle(
    "settings:setAgentProjectConfig",
    async (_event, args: { projectPath: string; config: any }) => {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const { join } = require("node:path");
      const prismDir = join(args.projectPath, ".workbench");
      const settingsPath = join(prismDir, "settings.json");
      if (!existsSync(prismDir)) mkdirSync(prismDir, { recursive: true });
      let data: any = {};
      if (existsSync(settingsPath)) {
        try {
          data = JSON.parse(readFileSync(settingsPath, "utf-8"));
        } catch {
          // Corrupted settings — start fresh
        }
      }
      data.agent = args.config;
      writeFileSync(settingsPath, JSON.stringify(data, null, 2), "utf-8");
    },
  );

  // ── Prompt Layers ──

  ipcMain.handle("settings:getLayers", async () => {
    return promptManager.getLayers().map((l) => ({
      id: l.id,
      priority: l.priority,
      source: l.source,
      userToggleable: l.userToggleable,
      enabled: l.enabled,
    }));
  });

  ipcMain.handle(
    "settings:setLayer",
    async (_event, args: { id: string; enabled: boolean }) => {
      promptManager.setLayerEnabled(args.id, args.enabled);
      // Persist layer states to electron-store
      updateSettings({
        promptLayers: promptManager.dumpLayerStates(),
      } as any);
    },
  );

  // ── Prompt Modules (read-only catalog) ──

  ipcMain.handle(
    "settings:getKnowledgeModules",
    async (_event, args?: { projectRoot?: string }) => {
      const ctx = args?.projectRoot ? await buildPromptContext(args.projectRoot) : {};
      return promptManager.getKnowledgeModuleCatalog(ctx);
    },
  );

  ipcMain.handle("settings:getBuiltinTools", async () => {
    const { ALL_NATIVE_TOOLS } = await import("../agent/tools/index");
    const { PI_PRIMITIVE_TOOLS, isPiPrimitiveToolName } = await import("../agent/capability-matrix");
    const categoryFor = (name: string): string => {
      if (name.startsWith("literature") || name.startsWith("citation") || name === "websearch" || name === "webfetch" || name === "document-read") return "reference";
      if (name.startsWith("latex")) return "compile";
      if (name === "question" || name === "suggest-plan" || isPiPrimitiveToolName(name)) return "utility";
      return "project";
    };
    const primitives = PI_PRIMITIVE_TOOLS.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: tool.notes,
      category: "utility",
      schemaDescription: tool.notes,
      promptGuidelines: [] as string[],
    }));
    const host = ALL_NATIVE_TOOLS.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      category: categoryFor(tool.name),
      schemaDescription: tool.description,
      promptGuidelines: tool.promptGuidelines ?? [],
    }));
    return [...primitives, ...host];
  });
}
