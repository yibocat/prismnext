import { promptManager } from "./index";
import { buildPromptContext } from "./context";
import { composeOrchestratorProfileModulePrompts } from "./resolve-active-modules";
import {
  assembleAgentSystemPrompt,
  buildAgentSystemPromptParts,
} from "./system-assemble";
import type { PromptContext } from "./types";
import { buildLiveTaskRosterMarkdown } from "../../shared/agent/subagent-roster";

export interface PromptStackSection {
  id: string;
  label: string;
  injectPath: string;
  fileHint?: string;
  content: string;
}

export interface PromptStackPreview {
  orchestratorId?: string;
  orchestratorName?: string;
  sections: PromptStackSection[];
  /** Concatenation of system-prompt sections — must equal live Pi system prompt. */
  liveSystemPrompt: string;
}

export interface BuildPromptStackPreviewOptions {
  projectRoot?: string;
  userCustomPrompt?: string;
  orchestratorId?: string | null;
}

function section(
  id: string,
  label: string,
  injectPath: string,
  content: string,
  fileHint?: string,
): PromptStackSection {
  return { id, label, injectPath, content: content.trim(), fileHint };
}

/** Markdown document for Settings → Prompt stack preview (read-only). */
export function formatPromptStackPreviewMarkdown(preview: PromptStackPreview): string {
  const lines = [
    "<!-- Generated preview — live Pi injection paths. Do not edit. -->",
    "",
    "# Prompt stack preview",
    "",
    "This shows what the model actually receives, **by injection path** — the same join used at session start.",
    "",
  ];

  if (preview.orchestratorName && preview.orchestratorId) {
    lines.push(
      `**Default orchestrator:** ${preview.orchestratorName} (\`${preview.orchestratorId}\`).`,
      "",
    );
  } else if (!preview.sections.some((s) => s.id === "agents-md")) {
    lines.push("*Open a project to preview AGENTS.md, project rules, Team lead, and built-in modules.*", "");
  }

  for (const block of preview.sections) {
    lines.push(`## ${block.label}`, "", `**Inject via:** ${block.injectPath}`);
    if (block.fileHint) lines.push(`**File:** \`${block.fileHint}\``);
    lines.push("");
    lines.push(block.content.trim() ? block.content.trim() : "*(empty)*", "");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export async function buildPromptStackPreview(
  options: BuildPromptStackPreviewOptions = {},
): Promise<PromptStackPreview> {
  const { projectRoot, userCustomPrompt, orchestratorId: explicitOrchestratorId } = options;

  let orchestratorId: string | undefined;
  let orchestratorName: string | undefined;
  let leadInstructions = "";
  let taskRoster = "";
  let profileModules = "";

  const ctx: PromptContext = await buildPromptContext(projectRoot);
  if (userCustomPrompt !== undefined) {
    ctx.userCustomPrompt = userCustomPrompt;
  }

  if (projectRoot) {
    const { resolveTeamPiBinding } = await import("../agent/team-binding");
    const binding = resolveTeamPiBinding({
      projectRoot,
      orchestratorId: explicitOrchestratorId ?? null,
    });
    if (binding.ok && binding.lead) {
      orchestratorId = binding.lead.runtimeName;
      orchestratorName = binding.lead.name;
      leadInstructions = binding.lead.instructions;
      profileModules = composeOrchestratorProfileModulePrompts(ctx);
      const roster = binding.availableRoster ?? [];
      taskRoster = buildLiveTaskRosterMarkdown(
        roster.map((entry) => ({
          id: entry.runtimeName,
          name: entry.name,
          description: entry.description,
          fqid: entry.fqid,
        })),
      );
    }
  }

  const stable = promptManager.composeStableSystem(ctx);
  const agentsMd = ctx.agentsMdContent ?? "";
  const liveSystemPrompt = assembleAgentSystemPrompt({
    stableSystem: stable,
    agentsMd,
    leadInstructions,
    leadName: orchestratorName,
    profileModules,
    taskRoster,
  });
  const parts = buildAgentSystemPromptParts({
    stableSystem: stable,
    agentsMd,
    leadInstructions,
    leadName: orchestratorName,
    profileModules,
    taskRoster,
  });

  const sections: PromptStackSection[] = [
    section(
      "host-identity",
      "Host identity",
      "Session start — prepended in assembleAgentSystemPrompt",
      parts.hostIdentity,
      "prompts/system-assemble.ts",
    ),
    section(
      "prism-system",
      "Pi system prompt (global baseline)",
      "Session start — core persona + global modules (not profile-only)",
      parts.stableSystem,
      "PromptManager.composeStableSystem",
    ),
    section(
      "agents-md",
      "AGENTS.md (project instructions)",
      "Session start — appended after the global baseline",
      parts.agentsMd,
      ".workbench/agent/AGENTS.md",
    ),
    section(
      "orchestrator-agent",
      orchestratorId ? `Team lead (\`${orchestratorId}\`)` : "Team lead",
      "Session start — user-editable Team instructions.md (no built-in modules)",
      parts.leadSection,
      orchestratorId ? `teams/…/orchestrators/…/instructions.md` : undefined,
    ),
    section(
      "profile-modules",
      "Built-in capability modules",
      "Session start — silent append after Team lead; not stored in Team files",
      parts.profileModules,
      "composeOrchestratorProfileModulePrompts",
    ),
    section(
      "task-roster",
      "Available subagents (via Task)",
      "Session start — live roster for this Team",
      parts.taskRoster,
      "buildLiveTaskRosterMarkdown",
    ),
    section(
      "project-rules",
      "Project rules",
      "Each chat turn — prepended to the user message (not the system prompt)",
      promptManager.composeProjectRules(ctx),
      ".workbench/agent/rules/*/RULE.md",
    ),
  ];

  return {
    orchestratorId,
    orchestratorName,
    sections,
    liveSystemPrompt,
  };
}

export { HOST_SYSTEM_IDENTITY } from "./system-assemble";
