import { projectAgentsMdRel } from "@shared/workbench/paths";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { settingsDesktop } from "@/lib/desktop-api/settings";
import { fetchKnowledgeModules } from "./knowledge-modules";

export type PromptStackPreview = Awaited<
  ReturnType<typeof settingsDesktop.settingsGetPromptStackPreview>
>;
export type PromptStackSection = PromptStackPreview["sections"][number];

export type BuiltinToolInfo = Awaited<
  ReturnType<typeof settingsDesktop.settingsGetBuiltinTools>
>[number];

export type PromptStackSummary = {
  totalTokens: number;
  sectionCount: number;
  orchestratorName?: string;
};

export type PromptInternalsSummary = {
  moduleCount: number;
  toolCount: number;
};

export type ProjectAgentsMd = {
  exists: boolean;
  content: string;
  charCount: number;
  hasContent: boolean;
};

function agentsMdPath(projectRoot: string): string {
  return `${projectRoot.replace(/[/\\]+$/, "")}/${projectAgentsMdRel()}`;
}

export async function fetchPromptStackPreview(
  projectRoot: string | null | undefined,
  userCustomPrompt?: string,
): Promise<PromptStackPreview> {
  return settingsDesktop.settingsGetPromptStackPreview(
    projectRoot ?? undefined,
    userCustomPrompt || undefined,
  );
}

export async function fetchPromptStackSummary(
  projectRoot: string | null | undefined,
  userCustomPrompt?: string,
): Promise<PromptStackSummary | null> {
  try {
    const stack = await fetchPromptStackPreview(projectRoot, userCustomPrompt);
    return {
      totalTokens: stack.totalTokenCount,
      sectionCount: stack.sections.length,
      orchestratorName: stack.orchestratorName,
    };
  } catch {
    return null;
  }
}

export async function fetchBuiltinTools(): Promise<BuiltinToolInfo[]> {
  try {
    return await settingsDesktop.settingsGetBuiltinTools();
  } catch {
    return [];
  }
}

export async function fetchPromptInternalsSummary(
  projectRoot: string | null | undefined,
): Promise<PromptInternalsSummary | null> {
  try {
    const [modules, tools] = await Promise.all([
      fetchKnowledgeModules(projectRoot),
      fetchBuiltinTools(),
    ]);
    return { moduleCount: modules.length, toolCount: tools.length };
  } catch {
    return null;
  }
}

export function subscribeExpertsIntegrationChanged(
  projectRoot: string | null | undefined,
  onChange: () => void,
): () => void {
  return settingsDesktop.onExpertsIntegrationChanged(({ projectPath }) => {
    if (!projectRoot || projectPath !== projectRoot) return;
    onChange();
  });
}

export async function fetchDefaultPersona(): Promise<string> {
  try {
    return await settingsDesktop.settingsGetDefaultPersona();
  } catch {
    return "";
  }
}

export async function readProjectAgentsMd(
  projectRoot: string | null | undefined,
): Promise<ProjectAgentsMd> {
  if (!projectRoot) {
    return { exists: false, content: "", charCount: 0, hasContent: false };
  }
  try {
    const path = agentsMdPath(projectRoot);
    const exists = await fsDesktop.fsExists(path);
    if (!exists) {
      return { exists: false, content: "", charCount: 0, hasContent: false };
    }
    const result = await fsDesktop.fsRead(path);
    const content = result?.content || "";
    return {
      exists: true,
      content,
      charCount: content.length,
      hasContent: content.trim().length > 0,
    };
  } catch {
    return { exists: false, content: "", charCount: 0, hasContent: false };
  }
}

export async function writeProjectAgentsMd(
  projectRoot: string,
  content: string,
): Promise<void> {
  await fsDesktop.fsWrite(agentsMdPath(projectRoot), content);
}
