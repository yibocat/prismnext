import { projectRulesRel } from "@shared/workbench/paths";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { fsDesktop } from "@/lib/desktop-api/fs";

export type ProjectRuleInfo = Awaited<
  ReturnType<typeof agentDesktop.agentListRules>
>[number];

export async function listProjectRules(projectRoot: string): Promise<ProjectRuleInfo[]> {
  try {
    return await agentDesktop.agentListRules(projectRoot);
  } catch {
    return [];
  }
}

export async function setProjectRuleEnabled(
  projectRoot: string,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  await agentDesktop.agentSetRuleEnabled(projectRoot, ruleId, enabled);
}

export async function deleteProjectRule(
  projectRoot: string,
  ruleId: string,
): Promise<void> {
  await agentDesktop.agentDeleteRule(projectRoot, ruleId);
}

export async function installProjectRule(
  projectRoot: string,
  ruleId: string,
  content: string,
): Promise<void> {
  await agentDesktop.agentInstallRule(projectRoot, ruleId, content);
}

export function projectRuleMdPath(projectRoot: string, ruleId: string): string {
  return `${projectRoot.replace(/[/\\]+$/, "")}/${projectRulesRel()}/${ruleId}/RULE.md`;
}

export async function readProjectRuleMd(
  projectRoot: string,
  ruleId: string,
): Promise<string> {
  const result = await fsDesktop.fsRead(projectRuleMdPath(projectRoot, ruleId));
  return result?.content ?? "";
}
