import type { AgentIntegration } from "../types";
import { ClaudeParser } from "./parser";
import { ClaudeSessionProvider } from "./sessions";
import { ClaudeCalculator } from "./calculator";

export const claudeAgent: AgentIntegration = {
  id: "claude",
  name: "Claude Code",
  description: "Anthropic Claude Code CLI",
  binary: "claude",
  args: [
    "--verbose",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--include-partial-messages",
    "--dangerously-skip-permissions",
  ],
  env: {
    CLAUDE_CODE_EFFORT_LEVEL: "low",
  },
  placeholder: false,
  configSubdir: "claude",
  supportsProjectConfig: true,
  gatewayEnvMapping: { baseUrl: "ANTHROPIC_BASE_URL", apiKey: "ANTHROPIC_API_KEY" },
  settings: [
    {
      key: "model",
      type: "model",
      label: "Model",
      options: [
        { id: null, name: "Default", desc: "Use system Claude Code setting" },
        { id: "sonnet", name: "Sonnet", desc: "Fast, efficient for most tasks" },
        { id: "opus", name: "Opus", desc: "Most capable, complex reasoning" },
        { id: "haiku", name: "Haiku", desc: "Fastest, simple tasks" },
      ],
    },
    {
      key: "agentMode",
      type: "select",
      label: "Mode",
      options: [
        { id: "edit-before-ask", name: "Edit before ask" },
        { id: "auto-edit", name: "Auto edit" },
        { id: "plan", name: "Plan mode" },
      ],
    },
    {
      key: "effort",
      type: "effort",
      label: "Effort",
      levels: ["low", "medium", "high"],
    },
  ],
  createParser: () => new ClaudeParser(),
  createSessionProvider: () => new ClaudeSessionProvider(),
  createCalculator: () => new ClaudeCalculator(),

  applySettings(settings) {
    const args: string[] = [];
    const env: Record<string, string> = {};

    // model → --model <model>
    const model = settings["model"];
    if (model) args.push("--model", model);

    // effort → CLAUDE_CODE_EFFORT_LEVEL env var (overrides agent.env default)
    const effort = settings["effort"];
    if (effort) env.CLAUDE_CODE_EFFORT_LEVEL = effort;

    // agentMode → --permission-mode (only for non-default modes)
    const mode = settings["agentMode"];
    if (mode && mode !== "edit-before-ask") {
      const modeMap: Record<string, string> = {
        "auto-edit": "acceptEdits",
        "plan": "plan",
      };
      const cliMode = modeMap[mode];
      if (cliMode) args.push("--permission-mode", cliMode);
    }

    return { args, env };
  },

  contextComponents: ["skills", "mcp", "rules", "venv", "path", "workspaceLayout"],

  assembleContext(ctx) {
    const args: string[] = [];
    let systemPrompt = ctx.appSystemPrompt;

    if (ctx.rules) {
      systemPrompt += "\n\n" + ctx.rules;
    }

    if (ctx.workspaceLayout) {
      systemPrompt += "\n\n## Project Workspace Layout\n\n" + ctx.workspaceLayout;
    }

    if (ctx.mcpConfig) {
      args.push("--mcp-config", ctx.mcpConfig);
    }

    return {
      systemPrompt,
      extraArgs: args,
      extraEnv: {
        ...(ctx.venvPath ? { VIRTUAL_ENV: ctx.venvPath } : {}),
        ...(ctx.augmentedPath ? { PATH: ctx.augmentedPath } : {}),
      },
    };
  },
};
