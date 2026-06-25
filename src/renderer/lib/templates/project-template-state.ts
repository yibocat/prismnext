/** Project-level template state persisted in `.prismnext/settings.json`. */

export interface ProjectTemplateState {
  id: string;
  category: string;
  appliedAt: string;
  appliedFiles: Record<string, string>;
}

function settingsPathForRoot(projectRoot: string): string {
  return `${projectRoot}/.prismnext/settings.json`;
}

function parseTemplateState(raw: unknown): ProjectTemplateState | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return null;
  return {
    id: t.id,
    category: typeof t.category === "string" ? t.category : "",
    appliedAt: typeof t.appliedAt === "string" ? t.appliedAt : "",
    appliedFiles:
      t.appliedFiles && typeof t.appliedFiles === "object" && !Array.isArray(t.appliedFiles)
        ? (t.appliedFiles as Record<string, string>)
        : {},
  };
}

/** Load template state from disk. Returns null if missing or invalid. */
export async function loadProjectTemplate(
  projectRoot: string,
): Promise<ProjectTemplateState | null> {
  const settingsPath = settingsPathForRoot(projectRoot);
  try {
    const exists = await window.electronAPI.fsExists(settingsPath);
    if (!exists) return null;
    const readResult = await window.electronAPI.fsRead(settingsPath);
    if (!readResult) return null;
    const settings = JSON.parse(readResult.content);
    return parseTemplateState(settings.template);
  } catch {
    return null;
  }
}

/** Merge template state into settings file (read-modify-write). */
export async function saveProjectTemplate(
  projectRoot: string,
  state: ProjectTemplateState,
): Promise<void> {
  const settingsPath = settingsPathForRoot(projectRoot);
  let settings: Record<string, unknown> = {};
  try {
    const exists = await window.electronAPI.fsExists(settingsPath);
    if (exists) {
      const readResult = await window.electronAPI.fsRead(settingsPath);
      if (readResult) {
        settings = JSON.parse(readResult.content);
      }
    }
  } catch {
    settings = {};
  }
  settings.template = state;
  await window.electronAPI.fsWrite(settingsPath, JSON.stringify(settings, null, 2));
}
