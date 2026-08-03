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
    const { resolveOrchestratorId, getOrchestrator } = await import("../services/experts-sync");

    orchestratorId = resolveOrchestratorId(projectRoot, explicitOrchestratorId ?? null);
    orchestratorName = getOrchestrator(projectRoot, orchestratorId)?.name;
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
      "_prism-system.md (global baseline)",
      "OpenCode `instructions` — written to `.prismnext/agent/_prism-system.md` on chat sync",
      stable,
      ".prismnext/agent/_prism-system.md",
    ),
  );

  sections.push(
    section(
      "agents-md",
      "AGENTS.md (project instructions)",
      "OpenCode `instructions` — separate file from _prism-system",
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
    const {
      getOrchestrator,
      readOrchestratorInstructions,
      renderOrchestratorAgentMarkdown,
      listExperts,
    } = await import("../services/experts-sync");

    const orchestrator = getOrchestrator(projectRoot, orchestratorId);
    if (orchestrator?.enabled) {
      const enabledExperts = listExperts(projectRoot).filter((e) => e.enabled);
      const enabledIds = new Set(enabledExperts.map((e) => e.id));
      const allowedIds = orchestrator.allowedExperts?.length
        ? orchestrator.allowedExperts.filter((id) => enabledIds.has(id))
        : enabledExperts.map((e) => e.id);
      const allowedRefs = allowedIds
        .map((id) => enabledExperts.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({ id: e.id, name: e.name, description: e.description }));

      const instructions = readOrchestratorInstructions(projectRoot, orchestrator);
      const agentMd = renderOrchestratorAgentMarkdown(orchestrator, instructions, allowedRefs);
      sections.push(
        section(
          "orchestrator-agent",
          `Orchestrator agent (\`${orchestratorId}\`)`,
          "OpenCode primary agent — instructions + profile Knowledge modules inline",
          agentMd,
          `<userData>/opencode-server/config/opencode/agents/${orchestratorId}.md`,
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
