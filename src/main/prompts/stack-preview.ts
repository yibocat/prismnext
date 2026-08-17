import { promptManager } from "./index";
import { buildPromptContext } from "./context";
import type { PromptContext } from "./types";

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
    "<!-- Generated preview — OpenCode + chat injection paths (Plan A). Do not edit. -->",
    "",
    "# Prompt stack preview",
    "",
    "This shows what the model actually receives, **by injection path** — not one monolithic system prompt.",
    "",
  ];

  if (preview.orchestratorName && preview.orchestratorId) {
    lines.push(
      `**Default orchestrator:** ${preview.orchestratorName} (\`${preview.orchestratorId}\`).`,
      "",
    );
  } else if (!preview.sections.some((s) => s.id === "agents-md")) {
    lines.push("*Open a project to preview AGENTS.md, project rules, and orchestrator agent.md.*", "");
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

  if (projectRoot) {
    const { resolveChatOrchestrator } = await import("../teams/resolver");
    const active = resolveChatOrchestrator(projectRoot, {
      orchestratorId: explicitOrchestratorId ?? null,
    });
    orchestratorId = active.runtimeName;
    orchestratorName = active.name;
  }

  const ctx: PromptContext = await buildPromptContext(projectRoot);
  if (userCustomPrompt !== undefined) {
    ctx.userCustomPrompt = userCustomPrompt;
  }

  const sections: PromptStackSection[] = [];

  const stable = promptManager.composeStableSystem(ctx);
  sections.push(
    section(
      "prism-system",
      "Pi system prompt (global baseline)",
      "Composed in memory and passed to ClosedResourceLoader — not written as OpenCode instructions",
      stable,
      "PromptManager.composeStableSystem",
    ),
  );

  sections.push(
    section(
      "agents-md",
      "AGENTS.md (project instructions)",
      "Read from `.prismnext/agent/AGENTS.md` and appended in AgentService",
      ctx.agentsMdContent ?? "",
      ".prismnext/agent/AGENTS.md",
    ),
  );

  const projectRules = promptManager.composeProjectRules(ctx);
  sections.push(
    section(
      "project-rules",
      "Project rules",
      "Each chat turn — user message block (all enabled always rules)",
      projectRules,
      ".prismnext/agent/rules/*/RULE.md",
    ),
  );

  if (projectRoot && orchestratorId) {
    const { buildAgentsPlan } = await import("../teams/agents-sync");
    const plan = buildAgentsPlan(projectRoot, { promptCtx: ctx });
    const opencodeOrchestratorId = plan.activeOrchestratorId;
    const agentMd =
      plan.agentEntries.find((e) => e.filename === `${opencodeOrchestratorId}.md`)?.content ?? "";
    if (agentMd) {
      sections.push(
        section(
          "orchestrator-agent",
          `Lead agent (\`${orchestratorId}\`)`,
          "Pi lead instructions from the active team",
          agentMd,
          `teams/${opencodeOrchestratorId}/instructions.md`,
        ),
      );
    }
  }

  return {
    orchestratorId,
    orchestratorName,
    sections,
  };
}
