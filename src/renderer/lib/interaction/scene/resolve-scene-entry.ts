import type { InteractionSpec } from "../../../../shared/interaction-spec";
import { isBuiltinSceneEntry, resolveSceneEntry } from "../../../../shared/interaction-scene";

function artifactDirAbs(projectRoot: string, id: string): string {
  const root = projectRoot.replace(/\/$/, "");
  return `${root}/.prismnext/artifacts/${id}`;
}

export type SceneEntryLoadResult = {
  entry: string;
  sourceText?: string;
};

/**
 * Resolve which scene entry to mount.
 * - builtin:* → built-in demo (only when spec.entry says so)
 * - otherwise → read artifact script; missing file is an error (no silent fallback)
 */
export async function loadSceneEntryForSpec(
  spec: InteractionSpec,
  projectRoot: string,
): Promise<SceneEntryLoadResult> {
  const entry = resolveSceneEntry(spec);
  if (!entry) {
    throw new Error("invalid scene entry");
  }

  if (isBuiltinSceneEntry(entry)) {
    return { entry };
  }

  const rel = `.prismnext/artifacts/${spec.id}/${entry}`;
  const abs = `${artifactDirAbs(projectRoot, spec.id)}/${entry}`;
  const res = await window.electronAPI.fsRead(abs);
  if (!res.missing && typeof res.content === "string" && res.content.trim()) {
    return { entry, sourceText: res.content };
  }

  throw new Error(
    `missing scene script "${rel}" — Agent must write ${entry} (export mount(ctx) or setup(ctx)) alongside spec.json`,
  );
}
