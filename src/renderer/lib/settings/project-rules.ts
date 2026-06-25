export interface ProjectRule {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

export function projectSettingsPath(projectRoot: string): string {
  return `${projectRoot.replace(/[/\\]+$/, "")}/.prismnext/settings.json`;
}

export async function loadProjectRules(projectRoot: string): Promise<ProjectRule[]> {
  const settingsPath = projectSettingsPath(projectRoot);
  try {
    const exists = await window.electronAPI.fsExists(settingsPath);
    if (!exists) return [];
    const result = await window.electronAPI.fsRead(settingsPath);
    const settings = result?.content ? JSON.parse(result.content) : {};
    const raw = Array.isArray(settings.customRules) ? settings.customRules : [];
    return raw.map((r: ProjectRule) => ({
      ...r,
      enabled: r.enabled !== false,
    }));
  } catch {
    return [];
  }
}

export async function saveProjectRules(
  projectRoot: string,
  rules: ProjectRule[],
): Promise<void> {
  const settingsPath = projectSettingsPath(projectRoot);
  let settings: Record<string, unknown> = {};
  const exists = await window.electronAPI.fsExists(settingsPath);
  if (exists) {
    const result = await window.electronAPI.fsRead(settingsPath);
    settings = result?.content ? JSON.parse(result.content) : {};
  }
  settings.customRules = rules;
  await window.electronAPI.fsWrite(settingsPath, JSON.stringify(settings, null, 2));
}
