import { ipcMain } from "electron";
import { getSettings, updateSettings } from "../services/settings";
import { promptManager } from "../prompts";
import { buildPromptContext } from "../prompts/context";
import { countPromptTokens } from "../lib/token-estimate";
import { PROMPT_TOKEN_ENCODING } from "../../shared/token-estimate";
import { CORE_PERSONA_PROMPT } from "../prompts/layers/core-persona";
import { AcpService } from "../acp/service";
import { resolvePermissionMode } from "../services/permission-modes";
import { resolveEffectiveAgentTerminalMode } from "../services/permission-modes";
import { refreshApplicationMenu } from "../menu";
import { syncTrayFromSettings } from "../services/tray";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
      // Invalidate prompt cache when user custom prompt changes
      if ("agentSystemPrompt" in patch) {
        promptManager.invalidate();
      }
      if ("appLocale" in patch) {
        refreshApplicationMenu();
      }
      if ("trayIconEnabled" in patch) {
        syncTrayFromSettings();
      }
      if ("permissionMode" in patch) {
        const service = AcpService.getInstance();
        const mode = resolvePermissionMode(patch.permissionMode as string | undefined);
        service.applyPermissionMode(mode);
        service.applyBuiltinToolsConfig();
        const terminalMode = resolveEffectiveAgentTerminalMode(
          mode,
          getSettings().agentTerminalMode as string | undefined,
        );
        await service.applyAgentTerminalMode(terminalMode);
        await service.syncBuiltinTools();
        // OpenCode reads opencode.json at process start — restart to apply new rules.
        // Active chat sessions may need a new tab after this.
        await service.reloadAfterPermissionModeChange();
      }
      if ("agentTerminalMode" in patch) {
        const service = AcpService.getInstance();
        const mode = (patch.agentTerminalMode as string) || "mirror";
        await service.applyAgentTerminalMode(mode);
        await service.syncBuiltinTools();
        await service.reloadAfterToolsChange();
      }
      if ("aiSubagentModel" in patch) {
        const service = AcpService.getInstance();
        // Pin built-in explore/general/… in opencode.json + rewrite expert agent.md.
        service.applyBuiltinToolsConfig();
        const lastProjectPath =
          typeof getSettings().lastProjectPath === "string"
            ? getSettings().lastProjectPath!.trim()
            : "";
        if (lastProjectPath) {
          const { refreshProjectSubagentsIntegration } = await import(
            "../services/project-subagents-refresh"
          );
          await refreshProjectSubagentsIntegration(lastProjectPath);
        }
        // OpenCode reads agent model at process start — restart to apply.
        await service.reloadAfterExpertsIntegration();
      }
    },
  );

  // ─── Agent Default Prompt ───

  ipcMain.handle(
    "settings:getAssembledPrompt",
    async (_event, args?: { projectRoot?: string; userCustomPrompt?: string }) => {
      const { buildPromptStackPreview, formatPromptStackPreviewMarkdown } = await import(
        "../prompts/stack-preview",
      );
      const preview = await buildPromptStackPreview({
        projectRoot: args?.projectRoot,
        userCustomPrompt: args?.userCustomPrompt,
      });
      return formatPromptStackPreviewMarkdown(preview);
    },
  );

  ipcMain.handle(
    "settings:getPromptStackPreview",
    async (_event, args?: { projectRoot?: string; userCustomPrompt?: string; orchestratorId?: string | null }) => {
      const { buildPromptStackPreview, formatPromptStackPreviewMarkdown } = await import(
        "../prompts/stack-preview",
      );
      const preview = await buildPromptStackPreview({
        projectRoot: args?.projectRoot,
        userCustomPrompt: args?.userCustomPrompt,
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
      const settingsPath = join(args.projectPath, ".prismnext", "settings.json");
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
      const prismDir = join(args.projectPath, ".prismnext");
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
    const { BUILTIN_TOOLS } = await import("../tools/index");
    const { buildOpencodeToolDescription } = await import("../tools/tool-description");
    return BUILTIN_TOOLS.map((meta) => ({
      name: meta.name,
      label: meta.label,
      description: meta.description,
      category: meta.category,
      schemaDescription: buildOpencodeToolDescription(meta),
    }));
  });
}
